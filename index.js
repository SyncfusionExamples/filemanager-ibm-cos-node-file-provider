// Create a new express server
const express = require('express');
const app = express();
const rateLimit = require("express-rate-limit");
// Enable rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
const AWS = require('ibm-cos-sdk');
const path = require('path');
const bodyParser = require("body-parser");
const archiver = require('archiver');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors')
const fsExtra = require('fs-extra');
// Sets default config to development node
const config = require('config');
// Get config variables
const awsConfig = config.get('config');
// Create S3 service object
var cos = new AWS.S3(awsConfig);
// Store the list of promised cloud objects
var promiseList = [];
// Multer to upload the files to the server
var fileName = [];
// Sets the response content type
const ContentType = 'application/octet-stream';
// MULTER CONFIG: To get file photos to temp server storage
const multerConfig = {
    // Specify disk storage (another option is memory)
    storage: multer.diskStorage({

        // Specify destination
        destination: function (req, file, next) {
            if (!fs.existsSync("./temp/")) {
                fs.mkdirSync("./temp/");
            }
            next(null, './temp');
        },
        // Specify the filename to be unique
        filename: function (req, file, next) {
            fileName.push(file.originalname);
            next(null, file.originalname);
        }
    }),
    // Filter out and prevent non-image files.
    fileFilter: function (req, file, next) {
        next(null, true);
    }
};

// Parse incoming request bodies in a middleware
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(limiter);
app.use(bodyParser.json());
app.use(cors());

/**
 * Gets the imageUrl from the client
 */
app.get('/GetImage', function (req, res) {
    const sanitizedPath = path.normalize(req.query.path).replace(/\\/g, '/');
    var relativeImagePath = sanitizedPath.split("/").length > 1 ? sanitizedPath : "/" + sanitizedPath;    cos.getObject({
        Bucket: awsConfig.bucketName,
        Key: relativeImagePath.substr(1, relativeImagePath.length),
    }).promise().then(function (data) {
        res.writeHead(200, { 'Content-type': 'image/jpg' });
        res.end(data.Body);
    });
});

/**
 * Handles the upload request
 */
app.post('/Upload', multer(multerConfig).any('uploadFiles'), function (req, res) {
    if (!fs.existsSync("./temp/")) {
        fs.mkdirSync("./temp/");
    }
    for (var index = 0; index < fileName.length; index++) {
        var id = index;
        var data = fs.readFileSync("./temp/" + fileName[id]);
        var uploadedFileName = fileName[id];
        promiseList.push(new Promise((resolve, reject) => {
            cos.putObject({
                Bucket: awsConfig.bucketName,
                Key: (req.body.path + uploadedFileName).substr(1, (req.body.path + uploadedFileName).length),
                Body: Buffer.from(data, 'base64'),
                ContentType: ContentType
            }, function (data) {
                resolve();
            })
        }));
    }
    Promise.all(promiseList).then(function (data) {
        res.send('Success');
        fileName = [];
        fsExtra.emptyDir("./temp")
            .then(() => {
                fs.rmdirSync("./temp")
            })
            .catch(err => {
                console.error(err)
            })
    });
});

/**
 * Function to get the folder
 */
var getFolder = (function () {
    function buildTree(tree, parts) {
        var lastDirectory = 'root';
        var directoryPath = '';
        parts.forEach(function (part) {
            var name = part.trim();
            if (!name || !!name.match(/^\/$/)) {
                return;
            }
            if (name.indexOf('.') === -1) {
                lastDirectory = name;
                directoryPath += lastDirectory + '/';
                if (!tree[name]) {
                    tree[directoryPath] = {
                        path: directoryPath,
                        files: []
                    };
                }
            } else {
                tree[directoryPath].files.push(name);
            }
        });
    }

    return function init(paths) {
        var tree = {
            root: {
                path: '',
                files: []
            }
        };
        paths.forEach(function (pat) {
            buildTree(tree, pat.Key.split('/'));
        });
        return tree;
    };
}());

/**
 * Downloads a file(s) or folder(s)
 */
app.post('/Download', function (req, res) {
    if (!fs.existsSync("./temp/")) {
        fs.mkdirSync("./temp/");
    }
    var downloadObj = JSON.parse(req.body.downloadInput);
    if (downloadObj.names.length === 1 && downloadObj.data[0].isFile) {
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: downloadObj.names[0],
        }).promise().then(function (data) {
            var bitmap = new Buffer(data.Body, 'base64');
            // Write buffer to file
            fs.writeFileSync("./temp/" + downloadObj.names[0], bitmap);
            res.download("./temp/" + downloadObj.names[0]);
            fsExtra.emptyDir("./temp")
                .then(() => {
                    fs.rmdirSync("./temp")
                })
                .catch(err => {
                });
        });
    } else {
        var archive = archiver('zip', {
            gzip: true,
            zlib: { level: 9 } // Sets the compression level.
        });
        downloadObj.data.forEach(function (item, index, downloadObj) {
            var downloadObj = JSON.parse(req.body.downloadInput);
            archive.on('error', function (err) {
                throw err;
            });
            if (item.isFile) {
                cos.getObject({
                    Bucket: awsConfig.bucketName,
                    Key: item.name,
                }).promise().then(function (data) {
                    var bitmap = new Buffer(data.Body, 'base64');
                    folder = item.name;
                    fs.writeFileSync("./temp/" + item.name, bitmap);
                });
            }
            else {
                cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/", Prefix: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/", Marker: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/" }, function (err, data) {
                    var tree;
                    if (data.Contents.length > 0) {
                        tree = getFolder(data.Contents);
                    } else {
                        tree = getFolder([{ "Key": data.Prefix }]);
                    }
                    for (item in tree) {
                        if (tree[item].path !== "" && !fs.existsSync("./temp/" + tree[item].path)) {
                            fs.mkdirSync("./temp/" + tree[item].path);
                        }
                    }
                    if (data.Contents.length > 0) {
                        for (var i = 0; i < data.Contents.length; i++) {
                            promiseList.push(new Promise((resolve, reject) => {
                                cos.getObject({
                                    Bucket: awsConfig.bucketName,
                                    Key: data.Contents[i].Key
                                }).promise().then(function (data) {
                                    var tempPath = path.join("./temp/", data.$response.request.params.Key);;
                                    var bitmap = new Buffer(data.Body.buffer, 'base64');
                                    if (path.extname(tempPath) != "") {
                                        fs.writeFileSync(tempPath, bitmap);
                                    }
                                    resolve(tempPath);
                                });
                            }));
                        }
                    }

                    Promise.all(promiseList).then(data => {
                        if (promiseList.length > 0) {
                            var archive = archiver('zip', {
                                gzip: true,
                                zlib: { level: 9 } // Sets the compression level.
                            });
                            var output = fs.createWriteStream('./Files.zip');
                            archive.directory('./temp/', "zip");
                            archive.pipe(output);
                            archive.finalize();
                            output.on('close', function () {
                                var stat = fs.statSync(output.path);
                                res.writeHead(200, {
                                    'Content-disposition': 'attachment; filename=Files.zip; filename*=UTF-8',
                                    'Content-Type': 'APPLICATION/octet-stream',
                                    'Content-Length': stat.size
                                });
                                var fileStream = fs.createReadStream(output.path);
                                fileStream.pipe(res);
                                fsExtra.emptyDir("./temp")
                                    .then(() => {
                                        fs.rmdirSync("./temp")
                                    })
                                    .catch(err => {
                                        console.error(err)
                                    })
                            });
                        }
                        promiseList = [];
                    });
                }.bind(this));
            }
        });
    }
});

/**
 * Function to get the recursive file details
 */
function recursiveFileDetails(prefix) {
    return new Promise((resolve, reject) => {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: prefix, Marker: prefix }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Prefix
                    }).promise().then(function (err, data) {
                        resolve(data);
                    })
                }));
                if (data.CommonPrefixes.length == 0) {
                } else {
                    recursiveFileDetails(file.Prefix)
                }
            })
            data.Contents.forEach(file => {
                getDataContent(file);
                if (data.Contents.length == 0) {
                } else {
                    recursiveFileDetails(file.Key)
                }
            })
            if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: data.Prefix
                    }).promise().then(function (data) {
                        resolve(data);
                    })
                }));
            }
        });
    });
}

/**
 * Function to get the size in kb, MB
 */
function getSize(size) {
    var sizeValue;
    if (size < 1024) sizeValue = size + ' B';
    else if (size < 1024 * 1024) sizeValue = (size / 1024).toFixed(2) + ' KB';
    else if (size < 1024 * 1024 * 1024) sizeValue = (size / 1024 / 1024).toFixed(2) + ' MB';
    else sizeValue = (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    return sizeValue;
}

/**
 * Function to get the data prefixes
 */
function getDataPrefixes(file) {
    promiseList.push(new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: file.Prefix
        }).promise().then(function (data) {
            recursiveFileDetails(file.Prefix).then(function (data) {
                resolve(data);
            });
            resolve(data);
        })
    }));
}

/**
 * Function to get the data content
 */
function getDataContent(file) {
    promiseList.push(new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: file.Key
        }).promise().then(function (data) {
            resolve(data);
        });
    }));
}

/**
 * Function to get the file details
 */
function fileDetails(req, res, isNamesAvailable, isMultipleFiles) {
    var details = {};
    var names = [];
    var size = 0;
    var modifiedDate = new Date();
    var response;

    Promise.all(promiseList).then(value => {
        if (value) {
            for (var i = 0; i < value.length; i++) {
                if (value[i]) {
                    size += value[i].Body ? value[i].Body.byteLength : 0;
                    modifiedDate = value[i].LastModified;
                }
            }
        }
        if (isMultipleFiles) {
            req.body.names.forEach(function (name) {
                if (name.split("/").length > 0) {
                    names.push(name.split("/")[name.split("/").length - 1]);
                }
                else {
                    names.push(name);
                }
            });

            details.name = names.join(", ");
            details.multipleFiles = true;
            details.type = "Multiple Types";
            if (req.body.data[0].path == "") {
                details.location = "Various Folders"
            } else {
                details.location = (awsConfig.bucketName + req.body.data[0].filterPath).substr(0, (awsConfig.bucketName + req.body.data[0].filterPath).length - 1);
            }
        } else {
            details.name = req.body.names[0];
            details.type = path.extname(details.name);
            if (isNamesAvailable) {
                if (req.body.data[0].filterPath == "") {
                    details.location = (req.body.data[0].filterPath + req.body.names[0]).substr(0, (req.body.data[0].filterPath + req.body.names[0].length));
                } else {
                    details.location = awsConfig.bucketName + req.body.data[0].filterPath + req.body.names[0];
                }
            } else {
                details.location = (awsConfig.bucketName + req.body.data[0].filterPath).substr(0, (awsConfig.bucketName + req.body.data[0].filterPath).length - 1);
            }
        }
        details.size = getSize(size);
        details.isFile = req.body.data[0].isFile;
        details.modified = modifiedDate;
        details.created = req.body.data[0].dateCreated;
        response = { details: details };
        if (value.length == promiseList.length) {
            responseDetails(res, response);
        }
    });
}

/**
 * Function to get the file details
 */
function getFileDetails(req, res) {
    var nameValues = [];
    promiseList = [];
    var reqObj = req;
    var isNamesAvailable = req.body.names.length > 0 ? true : false;
    var isMultipleFiles = false;
    if (req.body.names.length == 0 && req.body.data != 0) {
        req.body.data.forEach(function (item) {
            nameValues.push(item.name);
        });
        req.body.names = nameValues;
    }
    if (req.body.names.length == 1 && isNamesAvailable) {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/" }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                getDataPrefixes(file);
            });
            data.Contents.forEach(file => {
                getDataContent(file);
            });
            if (data.Contents.length == 0 && data.CommonPrefixes.length == 0) {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: reqObj.body.data[0].isFile ? data.Prefix.substr(0, data.Prefix.length - 1) : data.Prefix
                    }).promise().then(function (data) {
                        resolve(data);
                    })
                }));
            }
            fileDetails(req, res, isNamesAvailable, isMultipleFiles);
        });
    } else if (!isNamesAvailable) {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length), Prefix: "" + req.body.path.substr(1, req.body.path.length), Marker: "" + req.body.path.substr(1, req.body.path.length) }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                getDataPrefixes(file);
            });
            data.Contents.forEach(file => {
                getDataContent(file);
            });
            fileDetails(req, res, isNamesAvailable, isMultipleFiles);
        });
    } else {
        isMultipleFiles = true;
        req.body.data.forEach(function (value, i, data) {
            cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/" }, function (err, data) {
                data.CommonPrefixes.forEach(file => {
                    getDataPrefixes(file);
                });
                data.Contents.forEach(file => {
                    getDataContent(file);
                });
                if (data.Contents.length == 0 && data.CommonPrefixes.length == 0) {
                    var reqObj = req;
                    var dataPrefix = (data.Prefix.substr(0, data.Prefix.length - 1)).substr((data.Prefix.substr(0, data.Prefix.length - 1)).lastIndexOf("/") + 1, (data.Prefix.lenght))
                    var keyValue;
                    if (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath != "") {
                        keyValue = reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].isFile ?
                            (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).substr(1, (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).length) :
                            (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).substr(1, (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).length) + "/"
                    } else {
                        keyValue = reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].isFile ? data.Prefix.substr(0, data.Prefix.length - 1) : data.Prefix;
                    }
                    promiseList.push(new Promise((resolve, reject) => {
                        cos.getObject({
                            Bucket: awsConfig.bucketName,
                            Key: keyValue
                        }).promise().then(function (data) {
                            resolve(data);
                        })
                    }));
                }
                fileDetails(req, res, isNamesAvailable, isMultipleFiles);
            });
        })
    }
}

/**
 * Function to delete the recursive files.
 */
function recursiveFileDelete(prefix) {
    return new Promise((resolve, reject) => {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: prefix, Marker: prefix }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.deleteObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Prefix
                    }, function (data) {
                        resolve(data);
                    })
                }));
                if (data.CommonPrefixes.length == 0) {
                    resolve(data);
                } else {
                    recursiveFileDelete(file.Prefix)
                }
            })
            data.Contents.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.deleteObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Key
                    }, function (data) {
                        resolve(data);
                    })
                }));
                if (data.Contents.length == 0) {
                    resolve(data);
                } else {
                    recursiveFileDelete(file.Key)
                }
            })
            if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                resolve(data);
            }
        });
    });
}

/**
 * Function to delete the file
 */
function deleteFile(req, name, res) {
    return new Promise((resolve, reject) => {
        promiseList = [];
        if (name) {
            req.body.names = [name];
        }
        for (var i = 0; i < req.body.names.length; i++) {
            promiseList.push(new Promise((resolve, reject) => {
                cos.deleteObject({
                    Bucket: awsConfig.bucketName,
                    Key: ((req.body.path + req.body.names[i] + (req.body.data[i].isFile ? "" : "/")).substr(1, (req.body.path + req.body.names[i] + (req.body.data[i].isFile ? "" : "/")).length))
                }, function (data) {
                    resolve(1);
                })
            }));
            cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: "" + "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/" }, function (err, data) {
                data.CommonPrefixes.forEach(file => {
                    promiseList.push(new Promise((resolve, reject) => {
                        cos.deleteObject({
                            Bucket: awsConfig.bucketName,
                            Key: file.Prefix
                        }, function (data) {
                            recursiveFileDelete(file.Prefix).then(function (data) {
                                resolve(2);
                            });
                            resolve(3);
                        })
                    }));
                });
                data.Contents.forEach(file => {
                    promiseList.push(new Promise((resolve, reject) => {
                        cos.deleteObject({
                            Bucket: awsConfig.bucketName,
                            Key: file.Key
                        }, function (data) {
                            resolve(4);
                        })
                    }));
                });

                Promise.all(promiseList).then(data => {
                    promiseList = [];
                    if (name == null) {
                        response = {
                            files: [{ name: req.body.names[0] }], error: null,
                            details: null, cwd: null
                        };
                        response = JSON.stringify(response);
                        res.setHeader('Content-Type', 'application/json');

                        setTimeout(function () {
                            if (!res.headersSent) {
                                res.json(response);
                            }
                        }.bind(this), 3000)
                    }
                    resolve(data);
                });
            });
        }
    });
}

/**
 * Function to check the child elements
 */
function hasChild(fileName) {
    return new Promise((resolve, reject) => {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: fileName, Marker: fileName }, function (err, data) {
            if (data.CommonPrefixes.length > 0) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Function to update the response
 */
function responseDetails(res, response) {
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

   /**
   * Function to initialize the current working directory objects
   */
   function getCWDObjects() {
    var cwd = {};
    cwd.size = 0;
    cwd.isFile = false;
    cwd.dateModified = new Date();
    cwd.dateCreated = new Date();       
    cwd.type = "";
    return cwd;
}

   /**
   * Function to get the error details
   */
   function getErrorDetails(req, res) {
    var errorMsg = new Error();
    errorMsg.message = "A file or folder with the name " + req.body.name + " already exists.";
    errorMsg.code = "400";
    response = { error: errorMsg };
    response = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

/**
 * Function to moves file(s) or folder(s)
 */
function copyMoveOperations(action, req, res) {
    var req = req;
    var res = res;
    promiseList = [];

    cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/" }, function (err, data) {
        var tree;
        if (data.Contents.length > 0) {
            tree = getFolder(data.Contents);
        } else if (!req.body.data[0].isFile) {
            tree = getFolder([{ "Key": data.Prefix }]);
        } else {
            promiseList.push(new Promise((resolve, reject) => {
                cos.getObject({
                    Bucket: awsConfig.bucketName,
                    Key: data.Prefix.substr(0, data.Prefix.length - 1)
                }).promise().then(function (data) {
                    if (Array.isArray(req.body.names)) {
                        for (var i = 0; i < req.body.names.length; i++) {
                            var tempPath = path.join("./temp/", data.$response.request.params.Key);
                            if (path.extname(tempPath) != "") {
                                cos.putObject({
                                    Bucket: awsConfig.bucketName,
                                    Key: (req.body.targetPath + req.body.names[i]).substr(1, (req.body.targetPath + req.body.names[i]).length),
                                    Body: Buffer.from(data.Body, 'base64'),
                                    ContentType: ContentType
                                }).promise().then(function (data) {
                                });
                            }
                        }
                        resolve();
                    }
                });
            }));
        }
        for (item in tree) {
            if (tree[item].path !== "") {
                if (req.body.data[0].filterPath == "/") {
                    cos.putObject({
                        Bucket: awsConfig.bucketName,
                        Key: (req.body.targetPath + item).substr(1, ((req.body.targetPath + item).length - 1)),
                    }).promise().then(function (data) {
                    });
                } else {
                    cos.putObject({
                        Bucket: awsConfig.bucketName,
                        Key: (req.body.targetPath + req.body.names[0] + "/").substr(1, ((req.body.targetPath + req.body.names[0] + "/").length - 1)),
                    }).promise().then(function (data) {
                    });
                }
            }
        }
        if (data.Contents.length > 0) {
            for (var i = 0; i < data.Contents.length; i++) {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: data.Contents[i].Key
                    }).promise().then(function (data) {
                        var tempPath = path.join("./temp/", data.$response.request.params.Key);;
                        var fileName = path.basename(data.$response.request.params.Key);
                        if (path.extname(tempPath) != "") {
                            cos.putObject({
                                Bucket: awsConfig.bucketName,
                                Key: (req.body.targetPath + req.body.names[0] + "/" + fileName).substr(1, ((req.body.targetPath + req.body.names[0] + "/" + fileName).length - 1)),
                                Body: Buffer.from(data.Body, 'base64'),
                                ContentType: ContentType
                            }).promise().then(function (data) {
                            });
                        } else {
                            cos.putObject({
                                Bucket: awsConfig.bucketName,
                                Key: (req.body.targetPath + req.body.names[0] + "/" + fileName + "/").substr(1, ((req.body.targetPath + req.body.names[0] + "/" + fileName + "/").length - 1)),
                                Body: Buffer.from(data.Body, 'base64'),
                                ContentType: ContentType
                            }).promise().then(function (data) {
                            });
                        }
                        resolve();
                    });
                }));
            }
        }

        Promise.all(promiseList).then(data => {
            var cwd = getCWDObjects();
            var files = [];
            cwd.name = req.body.name;
            hasChild(req.body.path.substr(1, req.body.path.length) + "/").then(function (data) {
                cwd.hasChild = data;
                cwd.type = "";
                files.push(cwd);
                promiseList = [];
                if (action == "move") {
                    deleteFile(req, req.body.name, res).then(function (data) {
                        response = {
                            files: files, error: null,
                            details: null, cwd: null
                        };
                        responseDetails(res, response);
                    })
                } else {
                    response = {
                        files: files, error: null,
                        details: null, cwd: null
                    };
                    responseDetails(res, response);
                }
            });
        });
    }.bind(this));
}

app.post('/', function (req, res) {
    req.setTimeout(0);

    // Action for copying file(s) or folder(s)
    if (req.body.action == "copy") {
        copyMoveOperations("copy", req, res);
    }

    // Action for moving file(s) or folder(s)
    if (req.body.action == "move") {
        copyMoveOperations("move", req, res);
    }

    // Action for getting file(s) or folder(s) details
    if (req.body.action == "details") {
        getFileDetails(req, res);
    }

    // Action to creates a new folder
    if (req.body.action == "create") {
        var key;
        if (req.body.path == "/") {
            key = req.body.name + '/'
        } else {
            key = "" + req.body.path.substr(1, req.body.path.length) + req.body.name + "/";
        }
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: key,
        }, function (err, data) {
            if (err && err.statusCode == 404) {
                cos.putObject({
                    Bucket: awsConfig.bucketName,
                    Key: key,
                }).promise().then(function () {
                    response = {
                        files: [{ name: req.body.name }], error: null,
                        details: null, cwd: null
                    };
                    responseDetails(res, response);
                }).catch(function () {
                });
            }
            if (data) {
                getErrorDetails(req, res);
            }
        });
    }

    // Action to removes a file(s) or folder(s)
    if (req.body.action == "delete") {
        deleteFile(req, null, res);
    }

    // Action to renames a file(s) or folder(s)
    if (req.body.action === "rename") {
        if (!fs.existsSync("./temp/")) {
            fs.mkdirSync("./temp/");
        }
        var req = req;
        promiseList = [];

        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/" }, function (err, data) {
            var tree;
            var isResponseError = false;
            if (data.Contents.length > 0) {
                tree = getFolder(data.Contents);
            } else if (!req.body.data[0].isFile) {
                tree = getFolder([{ "Key": data.Prefix }]);
            } else {
                promiseList.push(new Promise((resolve, reject) => {
                    var keyValue;
                    if (req.body.data[0].path == "") {
                        var value = data.Prefix.substr(0, data.Prefix.length - 1);
                        keyValue = (req.body.data[0].filterPath + value).substr(1, (req.body.data[0].filterPath + value).length);
                    } else {
                        keyValue = data.Prefix.substr(0, data.Prefix.length - 1);
                    }
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: keyValue
                    }).promise().then(function (data) {
                        var tempPath = path.join("./temp/", data.$response.request.params.Key);;
                        if (path.extname(tempPath) != "") {
                            var key;
                            if (req.body.path == "/") {
                                key = req.body.newName;
                            } else {
                                key = "" + req.body.path.substr(1, req.body.path.length) + req.body.newName;
                            }
                            cos.getObject({
                                Bucket: awsConfig.bucketName,
                                Key: key,
                            }, function (err, data) {
                                if (err && err.statusCode == 404) {
                                    if (!req.body.data[0].isFile) {
                                        cos.putObject({
                                            Bucket: awsConfig.bucketName,
                                            Key: data.$response.request.params.Key.replace(req.body.name, (req.body.newName)),
                                            Body: Buffer.from(data.Body, 'base64'),
                                            ContentType: ContentType
                                        }).promise().then(function (data) {
                                        });
                                    } else {
                                        cos.getObject({
                                            Bucket: awsConfig.bucketName,
                                            Key: "" + req.body.path.substr(1, req.body.path.length) + req.body.name
                                        }, function (err, data) {
                                            cos.putObject({
                                                Bucket: awsConfig.bucketName,
                                                Key: "" + req.body.path.substr(1, req.body.path.length) + req.body.newName,
                                                Body: Buffer.from(data.Body, 'base64'),
                                                ContentType: ContentType
                                            }).promise().then(function (data) {
                                            });
                                        })
                                    }
                                }
                                if (data) {
                                    isResponseError = true;
                                    getErrorDetails(req, res);
                                }
                            });
                        }
                        resolve();
                    });
                }));
            }
            for (item in tree) {
                if (tree[item].path !== "") {
                    var key;
                    if (req.body.path == "/") {
                        key = req.body.newName + '/'
                    } else {
                        key = "" + req.body.path.substr(1, req.body.path.length) + req.body.newName + "/";
                    }
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: key,
                    }, function (err, data) {
                        if (err && err.statusCode == 404) {
                            cos.putObject({
                                Bucket: awsConfig.bucketName,
                                Key: item.replace((req.body.path + req.body.name).substr(1, (req.body.path + req.body.name).length), (req.body.path + req.body.newName).substr(1, (req.body.path + req.body.newName).length)),
                            }).promise().then(function (data) {
                            });
                        }
                        if (data) {
                            isResponseError = true;
                        }
                    });
                }
            }
            if (data.Contents.length > 0) {
                for (var i = 0; i < data.Contents.length; i++) {
                    promiseList.push(new Promise((resolve, reject) => {
                        cos.getObject({
                            Bucket: awsConfig.bucketName,
                            Key: data.Contents[i].Key
                        }).promise().then(function (data) {
                            var tempPath = path.join("./temp/", data.$response.request.params.Key);;
                            if (path.extname(tempPath) != "") {
                                cos.putObject({
                                    Bucket: awsConfig.bucketName,
                                    Key: data.$response.request.params.Key.replace(req.body.name, (req.body.newName)),
                                    Body: Buffer.from(data.Body, 'base64'),
                                    ContentType: ContentType
                                }).promise().then(function (data) {
                                });
                            }
                            resolve();
                        });
                    }));
                }
            }

            Promise.all(promiseList).then(data => {
                var cwd = getCWDObjects();
                var files = [];
                cwd.name = req.body.newName;
                cwd.filterPath = req.body.path;
                hasChild(req.body.path.substr(1, req.body.path.length) + req.body.newName + "/").then(function (data) {
                    cwd.hasChild = data;
                    cwd.type = "";
                    files.push(cwd);
                    promiseList = [];
                    if (isResponseError) {
                        getErrorDetails(req, res)
                    } else {
                        setTimeout(function () {
                            deleteFile(req, req.body.name, null).then(function (data) {
                                response = {
                                    files: files, error: null,
                                    details: null, cwd: null
                                };
                                responseDetails(res, response);
                            });

                        }, 3000);
                    }
                    fsExtra.emptyDir("./temp")
                        .then(() => {
                            fs.rmdirSync("./temp")
                        })
                        .catch(err => {

                        })
                });
            });
        }.bind(this));
    }

    // Action to searches a file
    if (req.body.action === 'search') {
        var searchString = req.body.searchString.replace(/\*/g, "")
        var caseSensitive = req.body.caseSensitive;
        var files = [];
        var filterName = "";
        var cwd = {};
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length), Prefix: "" + req.body.path.substr(1, req.body.path.length), Marker: "" + req.body.path.substr(1, req.body.path.length) }, function (err, data) {
            data.Contents.forEach(function (file, index, array) {
                cwd = {
                    name: req.body.data[0].name,
                    size: 0,
                    isFile: false,
                    dateModified: req.body.data[0].dateCreated,
                    dateCreated: req.body.data[0].dateModified,
                    filterPath: req.body.data[0].filterPath,
                    type: "",
                    hasChild : data.CommonPrefixes.length > 0 ? true : false
                };
                var size = file.Size;
                var dateModified = file.LastModified;
                filterName = "";
                file.Key.split("/").forEach(function (value, index, array) {
                    var isMatch = false;
                    if(!caseSensitive){
                        isMatch = value.toLowerCase().endsWith(searchString.toLowerCase()) || value.toLowerCase().includes(searchString.toLowerCase()) || value.toLowerCase().indexOf(searchString.toLowerCase()) >= 0;
                    } else {
                        isMatch = value.endsWith(searchString) || value.includes(searchString) || value.indexOf(searchString) >= 0;
                    }
                    if (isMatch) {
                        var filterFiles = {};
                        if (path.extname(value) == "") {
                            filterFiles.type = "";
                            filterFiles.isFile = false;
                        } else {
                            filterFiles.type = path.extname(value);
                            filterFiles.isFile = true;
                        }
                        filterFiles.name = value;
                        filterFiles.size = size
                        filterFiles.dateModified = dateModified;
                        filterFiles.dateCreated = new Date();
                        filterFiles.filterPath = "/" + filterName;
                        filterFiles.path = "";
                        filterFiles.hasChild = false;
                        if (files.findIndex(x => (x.name == filterFiles.name & x.filterPath == filterFiles.filterPath)) < 0) {
                            files.push(filterFiles);
                        }
                    }
                    filterName += value + "/";
                });
                if (index == array.length - 1) {
                    response = { cwd: cwd, files: files };
                    responseDetails(res, response);
                }
            });
        });
    }

    /**
    * Function to get the files list
    */
    function getFilesList(req) {
        return new Promise((resolve, reject) => {
            var files = [];
            var hasChildPromise = 0;
            if (req.body.path == "/") {
                cos.listObjects({ Bucket: awsConfig.bucketName.toString(), Delimiter: "/" }, function (err, data) {
                    data.CommonPrefixes.forEach((file, index, array) => {
                        var cwd = getCWDObjects();
                        cwd.name = file.Prefix.substr(0, file.Prefix.length - 1);                       
                        cwd.filterPath = req.body.path;
                        cwd.hasChild = false;
                        files.push(cwd);
                        hasChild(file.Prefix).then(function (data) {
                            hasChildPromise = hasChildPromise + 1;
                            var cwd = getCWDObjects(file);
                            cwd.name = file.Prefix.substr(0, file.Prefix.length - 1)
                            files[files.findIndex(x => x.name == cwd.name)].hasChild = data;
                            if (hasChildPromise == array.length) {
                                resolve(files);
                            }
                        })
                    });

                    data.Contents.forEach(file => {
                        var cwd = {};
                        cwd.name = file.Key;
                        cwd.size = file.Size;
                        cwd.isFile = true;
                        cwd.filterPath = req.body.path;
                        cwd.dateModified = file.LastModified;
                        cwd.dateCreated = file.LastModified;
                        cwd.type = path.extname(cwd.name);
                        cwd.hasChild = false;
                        files.push(cwd);
                    });
                    if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                        resolve([]);
                    }
                });

            } else {
                cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/"), Marker: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/") }, function (err, data, array) {
                    data.CommonPrefixes.forEach((file, index, array) => {
                        var cwd = getCWDObjects();
                        cwd.name = file.Prefix.replace(req.body.path.substr(1, req.body.path.length), "").replace("/", "");                      
                        cwd.filterPath = req.body.path;
                        cwd.hasChild = false;
                        files.push(cwd);
                        hasChild(file.Prefix).then(function (data) {
                            hasChildPromise = hasChildPromise + 1;
                            var cwd = getCWDObjects();
                            cwd.name = file.Prefix.replace(req.body.path.substr(1, req.body.path.length), "").replace("/", "");
                            files[files.findIndex(x => x.name == cwd.name)].hasChild = data;
                            if (hasChildPromise == array.length) {
                                resolve(files);
                            }
                        })
                    });
                    data.Contents.forEach(file => {
                        var cwd = {};
                        cwd.name = file.Key.replace(req.body.path.substr(1, req.body.path.length), "");
                        cwd.size = file.Size;
                        cwd.isFile = true;
                        cwd.dateModified = file.LastModified;
                        cwd.filterPath = req.body.path;
                        cwd.dateCreated = file.LastModified;
                        cwd.type = path.extname(cwd.name);
                        cwd.hasChild = false;
                        files.push(cwd);
                        resolve(files);
                    });
                    if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                        resolve([]);
                    }
                });

            }
        });
    }

    if (req.body.action == "read") {
        var response, cwdFile = {};
        if (req.body.path != "/") {
            cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/"), Marker: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/") }, function (err, data, array) {
                cwdFile = {
                    name: req.body.data[0].name,
                    size: 0,
                    isFile: false,
                    dateModified: req.body.data[0].dateCreated,
                    dateCreated: req.body.data[0].dateModified,
                    filterPath: req.body.data[0].filterPath,
                    type: "",
                    hasChild : data.CommonPrefixes.length > 0 ? true : false
                };
                getFilesList(req).then(data => {
                    response = {
                        cwd: cwdFile,
                        files: data
                    };
                    responseDetails(res, response);
                });
            });

        } else {
            cos.listObjects({ Bucket: awsConfig.bucketName.toString(), Delimiter: "/" }, function (err, data) {
                cwdFile = {
                    name: awsConfig.bucketName,
                    size: 0,
                    isFile: false,
                    dateModified: new Date(),
                    dateCreated: new Date(),
                    type: "",
                    filterPath: req.body.path === "/" ? "" : req.body.path,
                    hasChild : data.CommonPrefixes.length > 0 ? true : false
                };
                getFilesList(req).then(data => {
                    response = {
                        cwd: cwdFile,
                        files: data
                    };
                    responseDetails(res, response);
                });
            });
        }
    }
});

/**
 * Server serving port
 */
var runPort = process.env.PORT || 8090;
var server = app.listen(runPort, function () {
    server.setTimeout(10 * 60 * 1000);
    var host = server.address().address;
    var port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port);
});
