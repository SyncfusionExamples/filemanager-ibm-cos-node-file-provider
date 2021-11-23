# IBM Cloud Object Storage file provider for Syncfusion File Manager

This repository contains the IBM Cloud Object Storage file provider used for Syncfusion File Manager component.

## Key features

The IBM Cloud Object Storage file provider module allows you work with the IBM Cloud Object Storage. It also provides the methods for performing various file actions such as creating a new folder, renaming files, and deleting files.

The IBM Cloud Object Storage file provider serves the file providers support for the File Manager component with the IBM Cloud Object Storage.

The following actions can be performed in IBM Cloud Object Storage file provider.

| **Actions** | **Description** |
| --- | --- |
| Read     | Reads the files from IBM Cloud Object Storage. |
| Details  | Gets a file's details such as Type, Size, Location, and Modified date. |
| Upload   | Uploads a file in IBM Cloud Object Storage. It accepts uploaded media with the following characteristics: <ul><li>Maximum file size:  30MB</li><li>Accepted Media MIME types: `*/*` </li></ul> |
| Create   | Creates a new Folder. |
| Delete   | Deletes a folder or file. |
| Rename   | Renames a folder or file. |
| Search   | Searches a file or folder in IBM Cloud Object Storage. |
| Copy     | Copies the selected files or folders from target. |
| Move     | Moves the files or folders to the desired location. |
| Download | Downloads the selected file or folder.    |

## Prerequisites

To run the service, create an IBM Cloud Object Storage for accessing and storing the cloud objects as files or folders. Create an [IBM Cloud account](https://cloud.ibm.com/docs/services/cloud-object-storage/basics?topic=cloud-object-storage-provision) and then create Cloud Object Storage bucket to perform the file operations. Then, define the server credentials details such as `bucketname`, `endpoint`, `apiKeyId`, and `serviceInstanceId` within the `config/default.json` file found in the `config` folder as the following code snippet.

```

"bucketName": "Files",
"endpoint": "s3.xxxxxxxxxxxxxxxxxxxxxxxx.cloud",
"apiKeyId": "GMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxKGX",
"serviceInstanceId": "cxxn:v1:xxxxxxxxx:cloud-object-storage:xxxxxxxx:a/1651281f453343434e69c7fb70f38cd59b9:xxxxxxx-09xxe-xx-xxxx-a85eexxxxxaaf2e::"

```

## How to configure a web service

Follow these commands to configure the IBM Cloud Object Storage file provider.

- To install ej2-filemanager-ibm-cos-node-file-provider package, use the following command.

```sh

  npm install @syncfusion/ej2-filemanager-ibm-cos-node-file-provider

```

- To install the depend packages for the file provider, navigate to @syncfusion/ej2-filemanager-ibm-cos-node-file-provider folder within the node_modules and run the following command

```sh

  npm install

```

- Now, run the following command line to check the Node API service in local and it will start in `http://localhost:8090/`.

### To configure the port

- To configure the port, use like this `set PORT=3000`.

For example:

```sh
set PORT=3000 && node index.js
```

### Start the service

To start the service use this command.

```sh
npm start
```

## File Manager AjaxSettings

To access the basic actions such as Read, Delete, Copy, Move, Rename, Search, and Get Details of File Manager using IBM Cloud Object Storage file provider, map the following code snippet in the AjaxSettings property of File Manager.

Here, the `hostUrl` will be your locally hosted port number.

```
  var hostUrl = http://localhost:8090/;
        ajaxSettings: {
            url: hostUrl,
        }
```

## File download AjaxSettings

To perform download operation, initialize the `downloadUrl` property in AjaxSettings of the File Manager component.

```
  var hostUrl = http://localhost:8090/;
  ajaxSettings: {
            url: hostUrl,
            downloadUrl: hostUrl + 'Download'
        },
```

## File upload AjaxSettings

To perform upload operation, initialize the `uploadUrl` property in AjaxSettings of the File Manager component.

```
  var hostUrl = http://localhost:8090/;
  ajaxSettings: {
            url: hostUrl,
            uploadUrl: hostUrl + 'Upload'
        },
```

## File image preview AjaxSettings

To perform image preview support in the File Manager component, initialize the `getImageUrl` property in AjaxSettings of the File Manager component.

```
  var hostUrl = http://localhost:8090/;
  ajaxSettings: {
            url: hostUrl,
            getImageUrl: hostUrl + 'GetImage'
        },
```

The FileManager will be rendered as follows.

![File Manager](https://ej2.syncfusion.com/products/images/file-manager/readme.gif)

## Support

Product support is available through the following mediums:

- Create an incident in Syncfusion [Direct-trac](https://www.syncfusion.com/support/directtrac/incidents?utm_source=npm&utm_campaign=filemanager) support system or [Community forum](https://www.syncfusion.com/forums/essential-js2?utm_source=npm&utm_campaign=filemanager).
- Create a new [GitHub issue](https://github.com/syncfusion/ej2-javascript-ui-controls/issues/new).
- Ask your questions in [Stack Overflow](https://stackoverflow.com/?utm_source=npm&utm_campaign=filemanager) with tag `syncfusion` and `ej2`.

## License

Check the license details [here](https://github.com/syncfusion/ej2-javascript-ui-controls/blob/master/license).

## Changelog

Check the changelog [here](https://github.com/syncfusion/ej2-javascript-ui-controls/blob/master/controls/filemanager/CHANGELOG.md)

© Copyright 2020 Syncfusion, Inc. All Rights Reserved. The Syncfusion Essential Studio license and copyright applies to this distribution.
