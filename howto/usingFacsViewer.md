# Using FacsViewer

This is a brief tutorial showing how to use the FacsViewer class.

## 1. What it can do

FacsViewer is a single-class JS application designed to create conveniently-browsable views of collections of images. It provides an initial thumbnail-sized array of images, and when the user clicks on one, that image is shown in a large view where it can be rotated and zoomed; the large view also allows navigation forward and backward in the sequence.

## 2. How to use it

First of all, you will need to include both the JS file and the CSS file in your page in the normal way:

```
<link rel="stylesheet" href="css/FacsViewer.css" type="text/css"/>
<script src="js/FacsViewer.js"></script>
```
Then you will need to create an instance of the class, and configure it to display your images. There are two simple approaches to providing a list of images for the class to use:

### 2.1. Supplying a folder path
If the web server on which the images reside is set up to allow directory browsing for the directory containing the images, then you can just provide the URL of the directory to the class:

```  
var facsViewer = null;
  
function setupFacsViewer(){
  facsViewer = new FacsViewer({folder: 'https://www.example.org/images/'});
}
  
window.addEventListener('load', setupFacsViewer);
```

You can also supply the folder path in a URL parameter, like this:

```
https://www.example.org/facsViewer.html?folder=https://www.example.org/images
```

This has the advantage that users can bookmark and share URLs of specific images in the collection.

### 2.2. Providing a JSON image listing

If your server cannot be set up to allow image browsing, or you need to have more control over what images are included, you can supply FacsViewer with a JSON file containing a list of images:

```
var facsViewer = null;
  
function setupFacsViewer(){
  facsViewer = new FacsViewer({});
  facsViewer.loadJSON('path/to/json/file/json');  
}
  
window.addEventListener('load', setupFacsViewer);
```

The basic format of the JSON file is as follows:

```
{ "folder" : "https:\/\/www.example.org\/images",
    "images" : 
    [ 
      { "img" : "img1.jpg" },
      
      { "img" : "img2.jpg" }
    ]
}    
```    
## 3. Additional useful features

### 3.1 Folder browsing

If you are using the directory-browsing method of configuring the class, you should also be able to browse the folder structure on the server (limited of course to folders which have directory browsing turned on). If you wish to turn this behaviour off, you can set the `showExtraInfo` property to false:

```
facsViewer = new FacsViewer({folder: 'https://www.example.org/images/',
                        showExtraInfo = false});
```

### 3.2 Adding links for images

It may be useful for some or all of your images to be accompanied by links to external resources; for example, if your images are the pages of a historical manuscript, you might link each page to a specific point in a published transcription. This can only be done using the JSON method of configuring the class, and it requires two pieces of information. First, you need to include the link URL (absolute, or relative to the page hosting the image collection) for each image which has an associated resource:

```
{ "folder" : "https:\/\/www.example.org\/images",
    "images" : 
    [ 
      { "img" : "img1.jpg",
        "link": "doc.html#page1" },
      
      { "img" : "img2.jpg",
        "link": "doc.html#page2" }
    ]
}    
```  
Secondly, you need to provide a string which will be used to make the link text for the image:

```
facsViewer = new FacsViewer({linkText: 'Transcription'});
```
### 3.3 Providing options for image sizes

Large collections of large images can take a long time to render on the page, so if you have thumbnail versions of them, the responsiveness of the page can be improved. Rather than providing the path to a thumbnail for each image in a collection, it makes more sense to provide a single JavaScript function whose job is to convert the original image URL to its thumbnail equivalent (this of course requires that your files are named and organized in a methodical way). Here is an example:

```
  facsViewer = new FacsViewer({linkText: "Transcription"});
  facsViewer.funcFolderToThumbnail = function(folder){
        return folder.replace(/normal/, 'thumbnail');
   };
  facsViewer.loadJSON('path/to/json/file/json');  
```

This function would be passed the original image path, which might be `https://www.example.org/images/full_size/image1.jpg`, and it would return the equivalent thumbnail image: `https://www.example.org/images/thumbnail/image1.jpg`. Note: you need to set the `funcFolderToThumbnail` property prior to calling the `loadJSON` function, because the function needs to be available when the JSON is being processed.

Conversely, sometimes the full-size images are much to large to function effectively in the browsing mode, so you may use medium-size versions for the main page. In this case, you can supply another function to the FacsViewer to convert the folder path, like this:

```
  facsViewer.funcFolderToLarge = function(folder){
        return folder.replace(/normal/, 'large');
   };
```

This will be used when creating the link to display the image in another window or tab, so that a user can easily get access to the full-size image if they need to.

### 3.4 Controlling where images are displayed
By default, FacsViewer will create two `div` elements in the host page to display its content, one with `id="infoDisplay"`, which is used to display extra information such as folders in the folder tree, and one with `id="facsViewer"`, which is where the images are rendered. However, if such elements already exist in the page, it will use them rather than creating new ones. So you can control where the class will display its content in your page by creating those elements for yourself.

### 3.5 Targeting a specific image
If you want the page to open with one particular image selected initially, you can do it in two ways. You can set the hash in the page URL to the filename of the image:

```
https://www.example.com/facsViewer.html#image27.jpg
```
or you can provide a URL parameter "image":

```
https://www.example.com/facsViewer.html?image=image27.jpg
```
NOTE: This assumes that the image filenames are sensible—in other words, that they contain no spaces or other characters that are problematic in URLs and identifiers. Non-sensible filenames are transformed to fix them before their use as ids, so if you're stuck with a collection of bad filenames, you'll have to figure out the transformed id of the image you need to point to.

### 3.6 Customizing the image template
The block of code which contains an image and its controls is constructed from a code template which is embedded in the JavaScript (see the method `FacsViewer~addImageTemplate`). This template is added to the page at runtime, and then each individual image block is created by cloning it. However, you can override this by adding your own version of the template, which the FacsViewer will use in preference if it is already present in the page. It needs to look like this:

```
<template id="imgTemplate">
  <div id="str_imgId" class="facsViewerThumb">
    [...]
  </div>    
</template>
```
Note that the FacsViewer is expecting to find a range of different components in the template, and if they are not there, an error may result, so start by copying the existing template and make your changes cautiously, testing as you go. If all you want to do is (for example) remove the buttons which allow zooming, it's much simpler to add your own CSS which hides them, rather than hacking the template. You should only need a custom template if you want to change the structure of the block for some reason, or add something which is not there.





