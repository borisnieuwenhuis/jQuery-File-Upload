/*
 * JavaScript Load Image 1.2.3
 * https://github.com/blueimp/JavaScript-Load-Image
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * iOS image scaling fixes based on
 * https://github.com/stomita/ios-imagefile-megapixel
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */

/*jslint nomen: true, bitwise: true */
/*global window, document, URL, webkitURL, Blob, File, FileReader, define */

(function ($) {
    'use strict';

    // Loads an image for a given File object.
    // Invokes the callback with an img or optional canvas
    // element (if supported by the browser) as parameter:
    var loadImage = function (file, callback, options) {
            var img = document.createElement('img'),
                url,
                oUrl;
            img.onerror = callback;
            img.onload = function () {
                if (oUrl && !(options && options.noRevoke)) {
                    loadImage.revokeObjectURL(oUrl);
                }
                callback(loadImage.scale(img, options));
            };
            if ((window.Blob && file instanceof Blob) ||
                // Files are also Blob instances, but some browsers
                // (Firefox 3.6) support the File API but not Blobs:
                    (window.File && file instanceof File)) {
                url = oUrl = loadImage.createObjectURL(file);
                // Store the file type for resize processing:
                img._type = file.type;
            } else {
                url = file;
            }
            if (url) {
                img.src = url;
                return img;
            }
            return loadImage.readFile(file, function (e) {
                var target = e.target;
                if (target && target.result) {
                    img.src = target.result;
                } else {
                    callback(e);
                }
            });
        },
        // The check for URL.revokeObjectURL fixes an issue with Opera 12,
        // which provides URL.createObjectURL but doesn't properly implement it:
        urlAPI = (window.createObjectURL && window) ||
            (window.URL && URL.revokeObjectURL && URL) ||
            (window.webkitURL && webkitURL);

    // Detects subsampling in JPEG images:
    loadImage.detectSubsampling = function (img) {
        var iw = img.width,
            ih = img.height,
            canvas,
            ctx;
        if (iw * ih > 1024 * 1024) { // only consider mexapixel images
            canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            ctx = canvas.getContext('2d');
            ctx.drawImage(img, -iw + 1, 0);
            // subsampled image becomes half smaller in rendering size.
            // check alpha channel value to confirm image is covering edge pixel or not.
            // if alpha value is 0 image is not covering, hence subsampled.
            return ctx.getImageData(0, 0, 1, 1).data[3] === 0;
        }
        return false;
    };

    // Detects vertical squash in JPEG images:
    loadImage.detectVerticalSquash = function (img, ih) {
        var canvas = document.createElement('canvas'),
            ctx = canvas.getContext('2d'),
            data,
            sy,
            ey,
            py,
            alpha;
        canvas.width = 1;
        canvas.height = ih;
        ctx.drawImage(img, 0, 0);
        data = ctx.getImageData(0, 0, 1, ih).data;
        // search image edge pixel position in case it is squashed vertically:
        sy = 0;
        ey = ih;
        py = ih;
        while (py > sy) {
            alpha = data[(py - 1) * 4 + 3];
            if (alpha === 0) {
                ey = py;
            } else {
                sy = py;
            }
            py = (ey + sy) >> 1;
        }
        return py / ih;
    };

     /**
   * Transform canvas coordination according to specified frame size and orientation
   * Orientation value is from EXIF tag
   */
   loadImage.transformCoordinate = function(canvas, width, height, orientation) {
       switch (orientation) {
          case 5:
          case 6:
          case 7:
          case 8:
          canvas.width = height;
          canvas.height = width;
          break;
          default:
          canvas.width = width;
          canvas.height = height;
        }
        var ctx = canvas.getContext('2d');
        switch (orientation) {
          case 1:
          // nothing
          break;
        case 2:
          // horizontal flip
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          break;
        case 3:
          // 180 rotate left
          ctx.translate(width, height);
          ctx.rotate(Math.PI);
          break;
        case 4:
          // vertical flip
          ctx.translate(0, height);
          ctx.scale(1, -1);
          break;
        case 5:
          // vertical flip + 90 rotate right
          ctx.rotate(0.5 * Math.PI);
          ctx.scale(1, -1);
          break;
        case 6:
          // 90 rotate right
          ctx.rotate(0.5 * Math.PI);
          ctx.translate(0, -height);
          break;
        case 7:
          // horizontal flip + 90 rotate right
          ctx.rotate(0.5 * Math.PI);
          ctx.translate(width, -height);
          ctx.scale(-1, 1);
          break;
        case 8:
          // 90 rotate left
          ctx.rotate(-0.5 * Math.PI);
          ctx.translate(-width, 0);
          break;
        default:
          break;
      }
    };

    // Renders image to canvas while working around iOS image scaling bugs:
    // https://github.com/blueimp/JavaScript-Load-Image/issues/13
    loadImage.renderImageToCanvas = function (img, canvas, width, height, orientation) {
        var iw = img.naturalWidth, ih = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.save();
        loadImage.transformCoordinate(canvas, width, height, orientation);
        var subsampled = loadImage.detectSubsampling(img);
        if (subsampled) {
          iw /= 2;
          ih /= 2;
        }
        var d = 1024; // size of tiling canvas
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = tmpCanvas.height = d;
        var tmpCtx = tmpCanvas.getContext('2d');
        var vertSquashRatio = loadImage.detectVerticalSquash(img, iw, ih);
        var sy = 0;
        while (sy < ih) {
          var sh = sy + d > ih ? ih - sy : d;
          var sx = 0;
          while (sx < iw) {
            var sw = sx + d > iw ? iw - sx : d;
            tmpCtx.clearRect(0, 0, d, d);
            tmpCtx.drawImage(img, -sx, -sy);
            var dx = Math.floor(sx * width / iw);
            var dw = Math.ceil(sw * width / iw);
            var dy = Math.floor(sy * height / ih / vertSquashRatio);
            var dh = Math.ceil(sh * height / ih / vertSquashRatio);
            ctx.drawImage(tmpCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
            sx += d;
          }
          sy += d;
        }
        ctx.restore();
        tmpCanvas = tmpCtx = null;
    };

    // Scales the given image (img or canvas HTML element)
    // using the given options.
    // Returns a canvas object if the browser supports canvas
    // and the canvas option is true or a canvas object is passed
    // as image, else the scaled image:
    loadImage.scale = function (img, options) {
        options = options || {};
        var canvas = document.createElement('canvas'),
            width = img.width,
            height = img.height,
            scale = Math.max(
                (options.minWidth || width) / width,
                (options.minHeight || height) / height
            );
        if (scale > 1) {
            width = parseInt(width * scale, 10);
            height = parseInt(height * scale, 10);
        }
        scale = Math.min(
            (options.maxWidth || width) / width,
            (options.maxHeight || height) / height
        );
        if (scale < 1) {
            width = parseInt(width * scale, 10);
            height = parseInt(height * scale, 10);
        }
        if (img.getContext || (options.canvas && canvas.getContext)) {
            canvas.width = width;
            canvas.height = height;
            if (img._type === 'image/jpeg') {
                loadImage
                    .renderImageToCanvas(img, canvas, width, height, options.orientation);
            } else {
                canvas.getContext('2d')
                    .drawImage(img, 0, 0, width, height);
            }
            return canvas;
        }
        img.width = width;
        img.height = height;
        return img;
    };

    loadImage.createObjectURL = function (file) {
        return urlAPI ? urlAPI.createObjectURL(file) : false;
    };

    loadImage.revokeObjectURL = function (url) {
        return urlAPI ? urlAPI.revokeObjectURL(url) : false;
    };

    // Loads a given File object via FileReader interface,
    // invokes the callback with the event object (load or error).
    // The result can be read via event.target.result:
    loadImage.readFile = function (file, callback) {
        if (window.FileReader && FileReader.prototype.readAsDataURL) {
            var fileReader = new FileReader();
            fileReader.onload = fileReader.onerror = callback;
            fileReader.readAsDataURL(file);
            return fileReader;
        }
        return false;
    };

    if (typeof define === 'function' && define.amd) {
        define(function () {
            return loadImage;
        });
    } else {
        $.loadImage = loadImage;
    }
}(this));