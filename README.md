# facsViewer

This project provides a HTML/CSS/JS facsimile viewer which can read server directory listings. A JavaScript class, FacsViewer, generates a simple gallery-style image viewer allowing a user to page through all the images in a folder, and enlarge or rotate them. It works by retrieving a folder listing from the web server at the folder URL supplied as a parameter, so it requires a server that allows CORS (or it has to live on the same server as the images), and the server must also have Options+Indexes turned on.

If directory listings and CORS cannot be turned on, then the viewer can also work with list of files and folders provided in JSON format.

This was originally developed for UVic HCMC's Digital Victorian Periodical Poetry project, but has been spun off into a separate repository because it is being used in multiple projects.

## Simple configuration

The example file code/FacsViewer.html provides a simple example showing how to use the class:

<code>
    <script>
        "use strict";

        var facsViewer = null;

        function testFacsViewer(){
            console.log('Testing FacsViewer class.');
            facsViewer = new FacsViewer({folder: 'https://example.org/images/'});
        }

        window.addEventListener('load', testFacsViewer);
    </script>
</code>

## Detailed documentation

The docs folder contains more detailed documentation on the class; more documentation
on how to use the class will be added soon.
