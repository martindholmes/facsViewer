/*               FacsViewer.js                 */
/*           Author: Martin Holmes.            */
/*           University of Victoria.           */

/** This file originated as part of the Digital Victorian
  * Periodical Poetry project, but is now used in several
  * projects at the University of Victoria's Humanities
  * Computing and Media Centre.
  *
  * Free to anyone for any purpose (MPL-2.0), but
  * acknowledgement would be appreciated.
  *
  * This file defines a class designed to create a
  * simple image viewer allowing a user to page through
  * all the images in a folder. It works by retrieving a
  * folder listing from the web server at the folder URL
  * supplied as a parameter, so it requires a server that
  * allows CORS (or it has to live on the same server as
  * the images), and the server must also have Options
  * +Indexes turned on. It can also be configured with 
  * a JSON file listing for situations in which a server
  * cannot be configured to list directory contents.
  */

 /** WARNING:
   * This lib has "use strict" defined. You may
   * need to remove that if you are mixing this
   * code with non-strict JavaScript.
   */


"use strict";

/** @class FacsViewer
  * @description This class is instantiated with a single parameter
  * which is the URI of the folder whose image list it will retrieve,
  * and whose images it will display. That property can also be set on
  * the fly, causing the object to display a different set of images.
  *
  */
//ESLint seems to treat a class declaration as an unused variable. :-(
// eslint-disable-next-line no-unused-vars
class FacsViewer{
  constructor(options = {}){
    try {
      //Some constants to make things easier to read.
      this.FORWARD  = 0;
      this.BACKWARD = 1;

      //A match pattern to confirm that filepaths point to images.
      this.ptnImagePath = /.+\.((jpe?g)|(png)|(svg)|(gif))$/i;

      //Simpler match for folder paths. We only want subfolders.
      this.ptnFolderPath = /^[^/]+\/$/;

      //Array for images to display. Each array item is actually an
      //object with img and link properties, so that if required, each
      //image can have a link to an exernal location.
      this.images = [];

      //Counter for images that have been successfully loaded.
      this.imagesLoaded = 0;

      //When displaying large numbers of images, display in sets. Use a cutoff.
      this.maxImagesPerPage = options.maxImagesPerPage || 50; //Above this, break into sets.
      this.imagesPerPage    = options.imagesPerPage || 20;

      //Progress bar and container for tracking image loading. Instantiated during rendering.
      this.progressDiv = null;
      this.progress = null;

      //Array for links to subfolders to display.
      this.subfolders = [];

      //Parser for what we get from the server.
      this.parser = new DOMParser();

      //Whether to show additional info other than images.
      this.showExtraInfo = (options.showExtraInfo == false)? false:true;

      //If links are supplied, what text should be used for the link?
      this.linkText = options.linkText || 'Link';

      //How much to scale an image by when resizing.
      this.scaleFactor = options.scaleFactor || 0.3;

      //Find or create a dom element for display of info and folder-up link.
      this.infoEl = document.getElementById('infoDisplay');
      if ((!this.infoEl)&&(this.showExtraInfo)){
        this.infoEl = document.createElement('div');
        this.infoEl.setAttribute('id', 'infoDisplay');
        document.getElementsByTagName('body')[0].appendChild(this.infoEl);
      }

      //Find or create a dom element for display of links and images.
      this.displayEl = document.getElementById('facsViewer');
      if (!this.displayEl){
        this.displayEl = document.createElement('div');
        this.displayEl.setAttribute('id', 'facsViewer');
        document.getElementsByTagName('body')[0].appendChild(this.displayEl);
      }

      //Create a property to point to the template element when we
      //find or create it.
      this.templateEl = document.querySelector('template#imgTemplate');

      //Get the target id if there's a hash in the URL.
      this.initialTargId = document.location.hash.substring(1) || '';

      //Parse out the URLSearchParams
      this.searchParams = new URLSearchParams(decodeURI(document.location.search));

      //Folder URL to get stuff from. There are three ways to set this:
      //through a URL paramete,r through an options parameter, or through
      //a call to setFolder after construction.
      let tmpFolder = this.searchParams.get('folder') || options.folder || '';
      if (tmpFolder !== ''){
        //Make sure there's a final slash.
        this.setFolder(tmpFolder);
      }

      //Optional additional parameter for a function that can transform the
      //main folder path into a path to a thumbnail instead. If this is
      //supplied, then the object will create a <picture> element with
      //multiple sources, allowing rapid loading of thumbnails.
      this.funcFolderToThumbnail = options.funcFolderToThumbnail || null;

    }
    catch(e){
      console.log('ERROR: ' + e.message);
    }
  }

  /**
  * @function FacsViewer~imageLoaded
  * @description Called by each individual image when its content
  *              has loaded, so that overall loading can be tracked.
  */
  imageLoaded(){
    this.imagesLoaded++;
    this.progress.setAttribute('value', this.imagesLoaded);
    //console.log(this.imagesLoaded + ' / ' + this.images.length +  ' images loaded so far.');
    if (this.imagesLoaded >= this.images.length){
      document.body.style.cursor = 'default';
      this.progressDiv.style.display = 'none';
    }
  }

  /**
  * @function FacsViewer~setFolder
  * @description Sets the folder to browse, and kicks off the process of
  * retrieving listings from the server and displaying them.
  * @param {string} folder The URL of the folder.
  */
  setFolder(folder){
    //Make sure there's a final slash.
    this.folder = folder.replace(/\/$/, '') + '/';
    this.getListing();
  }
  /**
  * @function FacsViewer~loadJSON
  * @description Retrieves a JSON string from a URL, then calls readJSON to
  * parse its properties and show the results.
  * @param {URI} uri The URI from which to retrieve the string.
  */
  async loadJSON(uri){
    let response = await fetch(uri);
    let strJSON = await response.text();
    this.readJSON(strJSON);
  }

  /**
  * @function FacsViewer~readJSON
  * @description Loads image and subfolder information from a JSON string.
  * @param {string} strJSON The unparsed JSON string.
  */
  readJSON(strJSON){
    try{
      let obj = JSON.parse(strJSON);
      this.folder = '';
      this.images = [];
      this.subfolders = [];
      //Should we attempt to store the funcFolderTothumbnail function in the
      //JSON? I don't think so. Make the user set it externally.
      //this.funcFolderToThumbnail = null;
      //Make sure there's a final slash.
      if (obj.folder){
        this.folder = obj.folder.replace(/\/$/, '') + '/';
      }
      if (obj.images){
        for (let image of obj.images){
          //Create a normalized id for it, which we'll use later.
          let id = image.img.replace(/[\s'",?!@#$%[\]{};:]+/g, '_');
          this.images.push({img: (this.folder != '')? this.folder + image.img:image.img, 
                            inserted: false,
                            id: id, 
                            name: image.img});
          if (Object.prototype.hasOwnProperty.call(image, 'link')){
            this.images[this.images.length-1].link = image.link;
          }
        }
      }
      if (obj.subfolders){
        this.subfolders = obj.subfolders;
      }
      if ((obj.images) || (obj.subfolders)){
        this.render();
        return;
      }
      else{
        if (obj.folder){
          this.getListing();
        }
      }
    }
    catch(e){
      console.log('ERROR: ' + e.message);
    }

  }

  /**
  * @function FacsViewer~getListing
  * @description This uses fetch to retrieve a listing from the server at the
  * specified URL in this.folder, and then calls render() to build the
  * viewer.
  */
  getListing(){
    var self = this;
    fetch(this.folder).then(function(response){
      if (!response.ok) {
        this.reportError('HTTP error; status = ' + response.status);
        //throw new Error('HTTP error; status = ' + response.status);
      }
      else{
        return response.text();
      }
    }.bind(self))
    .then(function(listing){
      this.parseListing(listing);
    }.bind(self))
    .catch(function(error) {
      this.reportError(error.message);
    }.bind(self));
  }
  /**
  * @function FacsViewer~parseListing
  * @description This processes the listing to create an array of image
  * URLs for display. It needs to be robust against various configurations
  * of listings page HTML. It then calls the render function to display
  * the results.
  * @param {string} listing a string version of the page returned by the
  * server. We treat it as text because it's unlikely to be well-formed.
  */
  parseListing(listing){
      this.images = [];
      this.subfolders = [];
      let doc = this.parser.parseFromString(listing, 'text/html');
      let links = doc.getElementsByTagName('a');
      for (let i=0; i<links.length; i++){
        let href = links[i].getAttribute('href');
        if (href.match(this.ptnImagePath)){
          this.images.push({img: this.folder + href});
        }
        else{
          if (href.match(this.ptnFolderPath)){
            this.subfolders.push(href);
          }
        }
      }
      //console.dir(this.images);
      this.render();
  }
  /**
  * @function FacsViewer~addImageTemplate
  * @description This function adds an HTML <template> element to the 
  *              document (if one has not already been supplied) which
  *              can then be used to construct image containers as 
  *              needed.
  */
  addImageTemplate(){
    if (this.templateEl === null){
      let tp = document.createElement('template');
      tp.setAttribute('id', 'imgTemplate');
      tp.innerHTML = `<div id="str_imgId" class="facsViewerThumb">
        <div class="closer">
          <span>str_imgFilename</span>
          <a href="str_link">${this.linkText}</a>
          <a href="#">x</a>
        </div>
        <div>
          <div class="controls">
            <a class="arrow" title="Previous image"
              href="str_prevImgId">←</a>
          </div>
          <div class="imgContainer" id="facsImg_str_imgNum">
            <a href="str_imgId">
              <picture>
                <source media="(min-width: 7em)" 
                        srcset="str_img">
                <source srcset="str_imgThumb">
                <img src="str_img" crossorigin="anonymous" 
                  loading="lazy" title="str_imgFilename">
              </picture>
            </a>
          </div>
          <div class="controls">
            <a class="arrow" data-id="view"
              title="View this image in a separate window.">↗</a>
            <a class="arrow" data-id="rotate" title="Rotate">↻</a>
            <a class="arrow" title="Next image"
              href="str_nextImgId">→</a>
            <a class="arrow" data-id="enlarge" title="Enlarge">+</a>
            <a class="arrow" data-id="shrink" title="Shrink">-</a>
          </div>
        </div>
      </div>`;

      document.body.appendChild(tp);
      this.templateEl = tp;
    }
  }

  /**@function FacsViewer~createImageBlock
  * @description This creates and returns a div element configured
  *              for a specific image in the listing, based on the
  *              template which has been created above.
  * @param {number} i the number of the image in the images array,
  * @returns {HTMLDivElement} an HTML div element which has not yet
  *                 been inserted into the document. The calling
  *                 function will decide where to insert it.
  */
  createImageBlock(i){
    //Sanity check.
    if (isNaN(i)||(i < 0)||(i >= this.images.length)){
      throw(`Image number ${i} is not within the bounds of the images array.`);
    }
    //Just to be sure
    this.addImageTemplate();

    //Figure out some strings we need.
    let fName    = this.images[i].name;
    let id       = this.images[i].id;
    let lastId   = (i > 0)? this.images[i-1].id : this.images[this.images.length-1].id;
    let nextId   = (i < this.images.length - 1)? this.images[i+1].id : this.images[0].id;

    //Create an element.
    let clone = this.templateEl.content.cloneNode(true);

    let div = clone.querySelector('div');

    div.setAttribute('id', id);

    div.querySelector('div.closer>span').innerHTML = fName;

    let lnk = div.querySelector('div.closer>a');

    //If there's a link for the image, otherwise remove the element.
    if (Object.prototype.hasOwnProperty.call(this.images[i], 'link')){
      lnk.setAttribute('href', this.images[i].link);
    }
    else{
      lnk.parentNode.removeChild(lnk);
    }

    //Set some ids and hrefs.
    div.querySelector('a[href="str_prevImgId"]').setAttribute('href', '#' + lastId);
    div.querySelector('div.imgContainer').setAttribute('id', 'facsImg_' + i.toString());
    div.querySelector('a[href="str_nextImgId"]').setAttribute('href', '#' + nextId);
    div.querySelector('a[href="str_imgId"]').setAttribute('href', '#' + id);

    //Now handle the actual image. Whether there's a thumbnail or not, we'll
    //provide a regular img tag.
    let img = div.querySelector('img[src="str_img"]');
    img.setAttribute('src', this.images[i].img);
    img.setAttribute('title', fName);
    img.addEventListener('load', function(){this.imageLoaded()}.bind(this));

    //Now we fork based on whether a function has been provided to generate 
    //a thumbnail URL. If not, delete the source elements.
    if (this.funcFolderToThumbnail == null){
      for (let s of div.querySelectorAll('source')){
        s.parentNode.removeChild(s);
      }
    }
    //Otherwise, we generate the thumbnail URL and populate source elements.
    else{
      let thumb = this.funcFolderToThumbnail(this.images[i].img);
      div.querySelector('source[srcset="str_img"]').setAttribute('srcset', this.images[i].img);
      div.querySelector('source[srcset="str_imgThumb"]').setAttribute('srcset', thumb);
    }

    //Now the controls on the right: they need event listeners.
    div.querySelector('a[data-id="view"]').addEventListener('click', 
                      function(){window.open(this.images[i].img)}.bind(this));
    div.querySelector('a[data-id="rotate"]').addEventListener('click', 
                      function(){this.rotateImage(`facsImg_${i}`);}.bind(this));
    div.querySelector('a[data-id="enlarge"]').addEventListener('click', 
                      function(){this.scaleImage(`facsImg_${i}`, true);}.bind(this));
    div.querySelector('a[data-id="shrink"]').addEventListener('click', 
                      function(){this.scaleImage(`facsImg_${i}`, false);}.bind(this));

    //Return what we built.
    return div;
                  

  }

  /**
  * @function FacsViewer~render
  * @description This is the meat of the viewer. It processes a server index
  * listing or a JSON-configured listing to render a facsimile viewer on the page.
  * @param {number} startFrom the point in the images array from which to start
  *                            rendering. Defaults to 0, which means to start 
  *                            from the beginning.
  * @param {number} direction the direction to go from the starting point. We may
  *                            be moving forward or backward through the image set.
  * @param {string}  targId    a target id to display after the images have been 
  *                            inserted. Defaults to the class's targId property,
  *                            which is set on load from the location hash.
  * @param {boolean} startFresh whether or not to clear out existing content before
  *                             rendering. If not, new content will simply be added.
  */
  render(startFrom = 0, direction = this.FORWARD, targId = this.initialTargId, startFresh = true){
    //This takes a long while. Set a progress cursor.
    window.setTimeout(function(){console.log('Rendering...'); document.body.style.cursor = 'progress';}, 10);

    //Console logging for debugging purposes.
    console.log(`Rendering starting from ${startFrom} 
                 going in direction ${direction} 
                 with target id ${targId}
                 and startFresh=${startFresh}`);

    //Add a template element for images to the document if it's 
    //not there already.
    this.addImageTemplate(); 

    //Figure out the range of images that needs to be constructed.
    

    //And construct a progress bar.
    if (this.progressDiv == null){
      this.progressDiv = document.createElement('div');
      this.progressDiv.setAttribute('id', 'facsViewerProgressDiv');
      this.progress = document.createElement('progress');
      let prgLabel = document.createElement('label');
      prgLabel.setAttribute('for', 'facsViewerProgress');
      prgLabel.appendChild(document.createTextNode('Loading images...'));
      this.progressDiv.appendChild(prgLabel);
      this.progressDiv.appendChild(this.progress);
      document.body.appendChild(this.progressDiv);
    }
    this.imagesLoaded = 0;
    if (this.images.length > 0){
      this.progressDiv.style.display = 'block';
      this.progress.setAttribute('max', this.images.length);
      this.progress.setAttribute('value', '0');
    }
    else{
      this.progressDiv.style.display = 'none';
    }

    //If there's a hash in the URL, preload that image.
    if (targId.length > 0){
      let targImg = this.folder + targId;
      let preload = document.createElement('link');
      preload.href = targImg;
      preload.rel = "preload";
      preload.as = "image";
      document.body.appendChild(preload);
    }

    //Delete any existing content if we're starting fresh.
 
    this.displayEl.innerHTML = '';
    if (this.showExtraInfo){
      this.infoEl.innerHTML = '';
      let s = document.createElement('span');
      s.appendChild(document.createTextNode(this.folder));
      this.infoEl.appendChild(s);
      let link = document.createElement('a');
      link.addEventListener('click', function(){this.setFolder(this.folder.replace(/[^/]+\/$/, ''))}.bind(this));
      link.setAttribute('href', '#');
      link.setAttribute('title', 'Go up to the parent folder.');
      link.appendChild(document.createTextNode('⏶'));
      this.infoEl.appendChild(link);
      if (this.subfolders.length > 0){
        let ul = document.createElement('ul');
        ul.setAttribute('class', 'folderLinks');
        for (let i=0; i<this.subfolders.length; i++){
          let li = document.createElement('li');
          link = document.createElement('a');
          link.addEventListener('click', function(){this.setFolder(this.folder + this.subfolders[i])}.bind(this));
          link.setAttribute('href', '#');
          link.appendChild(document.createTextNode(this.subfolders[i]));
          li.appendChild(link);
          ul.appendChild(li);
        }
        this.displayEl.appendChild(ul);
      }
    }
    
    for (let i=0; i<this.images.length; i++){
      let div = this.createImageBlock(i);
      this.displayEl.appendChild(div);
      this.images[i].inserted = true;
    }
    
    //If there's a hash in the URL, select it.
    if (targId.length > 1){
      document.location.hash = '';
      setTimeout(function(){document.location.hash = '#' + targId;}, 200);
    }
    //Finally, set the cursor back to regular.
    // eslint-disable-next-line no-unused-vars
    window.addEventListener('load', (event) => {
      console.log('Done...'); document.body.style.cursor = 'default';
    });
  }

  /**
  * @function FacsViewer~rotateImage
  * @description Function to rotate an image by 90 degrees. This reads the
  * current value of the transform property, parses out the rotation bit
  * (if it's there), increments it and puts it back.
  * @param {string} divId The id of the div containing the image.
  */
  rotateImage(divId){
    let img = document.getElementById(divId).querySelector('img');
    if (img !== null){
      let tf = img.style.transform;
      let strCurrRot = tf.replace(/^(.*)rotate\((\d+)deg\)(.*)$/, '$2');
      let currRot = (strCurrRot.match(/^\d+$/))? parseInt(strCurrRot): 0;
      let newRot = ((currRot + 90) % 360);
      if (tf.indexOf('rotate') > -1){
        img.style.transform = tf.replace(/^(.*)rotate\((\d+)deg\)(.*)$/, '$1rotate(' + newRot + 'deg)$3');
      }
      else{
        img.style.transform = tf + ' rotate(' + newRot + 'deg)';
      }
      setTimeout(function(){this.repositionImage(divId);}.bind(this), 1);
    }
  }

  /**
  * @function FacsViewer~scaleImage
  * @description Function to scale an image by a positive or negative .02.
  * This parses out the current value of the scale factor from the transform
  * property, then changes it appropriately.
  * @param {string} divId The id of the div containing the image.
  * @param {boolean} enlarge Boolean value to specify whether to enlarge or shrink.
  */
  scaleImage(divId, enlarge){
    let div = document.getElementById(divId);
    if (div !== null){
      let tf = div.style.transform;
      let strCurrScale = tf.replace(/^(.*)scale\(([\d.]+)\)(.*)$/, '$2');
      let currScale = (strCurrScale.match(/^[\d.]+$/))? parseFloat(strCurrScale): 1.0;
      let newScale = currScale + (enlarge? this.scaleFactor : this.scaleFactor * -1);

      div.style.transformOrigin = '50% 0%';
      if (tf.indexOf('scale(') > -1){
        div.style.transform = tf.replace(/^(.*)scale\(([\d.]+)\)(.*)$/, '$1scale(' + newScale + ')$3');
      }
      else{
        div.style.transform = tf + ' scale(' + newScale + ')';
      }
      setTimeout(function(){this.repositionImage(divId);}.bind(this), 1);
    }
  }

  /**
  * @function FacsViewer~repositionImage
  * @description Function to move an image container so that its top
  * and left are onscreen, making the whole image available for scrolling.
  * @param {string} divId The id of the div containing the image.
  */
  repositionImage(divId){
    let div = document.getElementById(divId);
    let img = div.querySelector('img');
    if ((div !== null)&&(img !== null)){
      let leftOrigin = 50;
      while (img.getBoundingClientRect().x < 20){
        leftOrigin--;
        div.style.transformOrigin = leftOrigin + '% 0%';
      }
    }
  }

  /**
  * @function FacsViewer~resetImage
  * @description Function to reset the size and orientation of an image
  * to its default.
  * @param {string} divId The id of the div containing the image.
  */
  resetImage(divId){
    let div = document.getElementById(divId);
    let cont = div.querySelector('div.imgContainer');
    let img = div.querySelector('img');
    div.style.transform = 'none';
    cont.style.transform = 'none';
    img.style.transform = 'none';
  }

  /**
  * @function FacsViewer~reportError
  * @description Simple error reporting mechanism for informing the user.
  * @param {string} msg The error message to report.
  */
  reportError(msg){
    console.log('Error: ' + msg);
    let fullMsg = 'Unable to retrieve image listing from ' + this.folder + '. ';
    fullMsg += 'Error: ' + msg;
    this.displayEl.innerHTML = '';
    this.displayEl.appendChild(document.createElement('p').appendChild(document.createTextNode(fullMsg)));
  }
}
