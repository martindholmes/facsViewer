/*               FacsViewer.js                 */
/*           Author: Martin Holmes.            */
/*           University of Victoria.           */

/** This file is part of the Digital Victorian
  * Periodical Poetry project.
  *
  * Free to anyone for any purpose, but
  * acknowledgement would be appreciated.
  *
  * This file defines a class designed to create a
  * simple image viewer allowing a user to page through
  * all the images in a folder. It works by retrieving a
  * folder listing from the web server at the folder URL
  * supplied as a parameter, so it requires a server that
  * allows CORS (or it has to live on the same server as
  * the images), and the server must also have Options
  * +Indexes turned on.
  */

 /** WARNING:
   * This lib has "use strict" defined. You may
   * need to remove that if you are mixing this
   * code with non-strict JavaScript.
   */

/* jshint strict:false */
/* jshint esversion: 6*/
/* jshint strict: global*/
/* jshint browser: true */

"use strict";

/** @class FacsViewer
  * @description This class is instantiated with a single parameter
  * which is the URI of the folder whose image list it will retrieve,
  * and whose images it will display. That property can also be set on
  * the fly, causing the object to display a different set of images.
  *
  *
  */
class FacsViewer{
  constructor(options = {}){
    try {
      //A match pattern to confirm that filepaths point to images.
      this.ptnImagePath = /.+\.((jpe?g)|(png)|(svg)|(gif))$/i;

      //Simpler match for folder paths. We only want subfolders.
      this.ptnFolderPath = /^[^\/]+\/$/;

      //Array for images to display. Each array item is actually an
      //object with img and link properties, so that if required, each
      //image can have a link to an exernal location.
      this.images = [];

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
      let funcFolderToThumbnail = options.funcFolderToThumbnail || null;

    }
    catch(e){
      console.log('ERROR: ' + e.message);
    }
  }
  /**
  * @function FacsViewer~setFolder
  * @description Sets the folder to browse, and kicks off the process of
  * retrieving listings from the server and displaying them.
  * @param {String} folder The URL of the folder.
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
  * @param {String} strJSON The unparsed JSON string.
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
          this.images.push({img: (this.folder != '')? this.folder + image.img:image.img});
          if (image.hasOwnProperty('link')){
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
  * @param {String} listing a string version of the page returned by the
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
  * @function FacsViewer~render
  * @description This is the meat of the viewer. It processes a server index
  * listing to render a facsimile viewer on the page.
  */
  render(){
    this.displayEl.innerHTML = '';
    if (this.showExtraInfo){
      this.infoEl.innerHTML = '';
      let s = document.createElement('span');
      s.appendChild(document.createTextNode(this.folder));
      this.infoEl.appendChild(s);
      let link = document.createElement('a');
      link.addEventListener('click', function(){this.setFolder(this.folder.replace(/[^\/]+\/$/, ''))}.bind(this));
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
    let body = document.getElementsByTagName('body')[0];
    let closer = document.createElement('div');
    closer.setAttribute('class', 'closer');
    let lbl = document.createElement('span');
    lbl.appendChild(document.createTextNode('filename'));
    let closeLink = document.createElement('a');
    closeLink.setAttribute('href', '#');
    closeLink.appendChild(document.createTextNode('🗙'));
    closer.appendChild(lbl);
    closer.appendChild(closeLink);
    body.appendChild(closer);
    let leftArrow = document.createElement('a');
    leftArrow.setAttribute('class', 'arrow');
    leftArrow.appendChild(document.createTextNode('⏴'));
    body.appendChild(leftArrow);
    let rightArrow = document.createElement('a');
    rightArrow.setAttribute('class', 'arrow');
    rightArrow.appendChild(document.createTextNode('⏵'));
    body.appendChild(rightArrow);
    let jumper = document.createElement('a');
    jumper.setAttribute('class', 'arrow');
    jumper.setAttribute('title', 'View this image in a separate window.')
    jumper.appendChild(document.createTextNode('↗'));
    body.appendChild(jumper);
    let rotator = document.createElement('a');
    rotator.setAttribute('class', 'arrow');
    rotator.appendChild(document.createTextNode('↻'));
    body.appendChild(rotator);
    let plus = document.createElement('a');
    plus.setAttribute('class', 'arrow');
    plus.appendChild(document.createTextNode('+'));
    body.appendChild(plus);
    let minus = document.createElement('a');
    minus.setAttribute('class', 'arrow');
    minus.appendChild(document.createTextNode('-'));
    body.appendChild(minus);
    for (let i=0; i<this.images.length; i++){
      let fName = this.images[i].img.split('/').pop();
      let lastName = (i > 0)? this.images[i-1].img.split('/').pop() : this.images[this.images.length-1].img.split('/').pop();
      let nextName = (i < this.images.length - 1)? this.images[i+1].img.split('/').pop() : this.images[0].img.split('/').pop();
      let id = fName.replace(/[\s'",\?\!@#$%\[\]\{\};:]+/g, '_');
      let div = document.createElement('div');
      div.setAttribute('id', id);
      div.setAttribute('class', 'facsViewerThumb');
      let c = closer.cloneNode(true);
      c.getElementsByTagName('span')[0].innerHTML = fName;
      if (this.images[i].hasOwnProperty('link')){
        let imgLink = document.createElement('a');
        imgLink.setAttribute('href', this.images[i].link);
        imgLink.appendChild(document.createTextNode(this.linkText));
        c.insertBefore(imgLink, c.getElementsByTagName('a')[0]);
      }
      div.appendChild(c);
      let div2 = document.createElement('div');
      let divLa = document.createElement('div');
      divLa.setAttribute('class', 'controls');
      let la = leftArrow.cloneNode(true);
      la.setAttribute('href', '#' + lastName);
      divLa.appendChild(la);
      div2.appendChild(divLa);
      let divImg = document.createElement('div');
      divImg.setAttribute('class', 'imgContainer');
      divImg.setAttribute('id', 'facsImg_' + i);

      let a = document.createElement('a');
      a.setAttribute('href', '#' + id);
      if (this.funcFolderToThumbnail == null){
        let img = document.createElement('img');
        img.setAttribute('src', this.images[i].img);
        img.setAttribute('crossorigin', 'anonymous');
        img.setAttribute('title', fName);
        a.appendChild(img);
      }
      else{
        let thumb = this.funcFolderToThumbnail(this.images[i].img);
        console.log('Using thumbnail ' + thumb);
        let pic = document.createElement('picture');
        let src1 = document.createElement('source');
        src1.setAttribute('media', '(max-width: 6em)');
        src1.setAttribute('srcset', thumb);
        pic.appendChild(src1);
        let src2 = document.createElement('source');
        src2.setAttribute('media', '(min-width: 6.1em)');
        src2.setAttribute('srcset', this.images[i].img);
        pic.appendChild(src2);
        let img = document.createElement('img');
        img.setAttribute('src', this.images[i].img);
        img.setAttribute('crossorigin', 'anonymous');
        img.setAttribute('title', fName);
        pic.appendChild(img);
        a.appendChild(pic);
      }
      divImg.appendChild(a);
      div2.appendChild(divImg);
      let divCtrls = document.createElement('div');
      divCtrls.setAttribute('class', 'controls');
      let ju = jumper.cloneNode(true);
      ju.addEventListener('click', function(){window.open(this.images[i].img)}.bind(this));
      divCtrls.appendChild(ju);
      let ro = rotator.cloneNode(true);
      ro.addEventListener('click', function(){this.rotateImage('facsImg_' + i);}.bind(this));
      divCtrls.appendChild(ro);
      let ra = rightArrow.cloneNode(true);
      ra.setAttribute('href', '#' + nextName);
      divCtrls.appendChild(ra);
      let p = plus.cloneNode(true);
      p.addEventListener('click', function(){this.scaleImage('facsImg_' + i, true);}.bind(this));
      divCtrls.appendChild(p);
      let m = minus.cloneNode(true);
      m.addEventListener('click', function(){this.scaleImage('facsImg_' + i, false);}.bind(this));
      divCtrls.appendChild(m);
      div2.appendChild(divCtrls);
      div.appendChild(div2);
      this.displayEl.appendChild(div);
    }
    body.removeChild(closer);
    body.removeChild(leftArrow);
    body.removeChild(rightArrow);
    body.removeChild(rotator);
    body.removeChild(jumper);
    body.removeChild(plus);
    body.removeChild(minus);
    //If there's a hash in the URL, select it.
    if (document.location.hash.length > 2){
      let str = document.location.hash;
      document.location.hash = '';
      setTimeout(function(){document.location.hash = str;}, 200);
    }

  }

  /**
  * @function FacsViewer~rotateImage
  * @description Function to rotate an image by 90 degrees. This reads the
  * current value of the transform property, parses out the rotation bit
  * (if it's there), increments it and puts it back.
  * @param {String} divId The id of the div containing the image.
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
  * @param {String} divId The id of the div containing the image.
  * @param {Boolean} enlarge Boolean value to specify whether to enlarge or shrink.
  */
  scaleImage(divId, enlarge){
    let div = document.getElementById(divId);
    if (div !== null){
      let tf = div.style.transform;
      let strCurrScale = tf.replace(/^(.*)scale\(([\d\.]+)\)(.*)$/, '$2');
      let currScale = (strCurrScale.match(/^[\d\.]+$/))? parseFloat(strCurrScale): 1.0;
      let newScale = currScale + (enlarge? this.scaleFactor : this.scaleFactor * -1);

      div.style.transformOrigin = '50% 0%';
      if (tf.indexOf('scale(') > -1){
        div.style.transform = tf.replace(/^(.*)scale\(([\d\.]+)\)(.*)$/, '$1scale(' + newScale + ')$3');
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
  * @param {String} divId The id of the div containing the image.
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
  * @param {String} divId The id of the div containing the image.
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
  * @param {String} msg The error message to report.
  */
  reportError(msg){
    console.log('Error: ' + msg);
    let fullMsg = 'Unable to retrieve image listing from ' + this.folder + '. ';
    fullMsg += 'Error: ' + msg;
    this.displayEl.innerHTML = '';
    this.displayEl.appendChild(document.createElement('p').appendChild(document.createTextNode(fullMsg)));
  }
}
