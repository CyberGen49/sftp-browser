# sftp-browser
A web-based SFTP file browser that makes managing your server files easy!

![Screenshot](./screenshot.png)

SFTP Browser is still in development, but you can play with it at [sftpbrowser.cybah.me](https://sftpbrowser.cybah.me). In addition to the web interface, there's a fully-built SFTP HTTP API that's used for interfacing with the origin server.

This line was written using the text file editor built into SFTP Browser!!

## Features
- Connect to SFTP servers hosted on any platform
- Import and export server connections
- Navigate directories with ease
- Sort files by different attributes
- Show or hide hidden (dot) files
- Switch between list and tile views
- Download multiple files/directories as a single zip file
- Upload files, create new files, and create directories
- Rename and delete files
- Cut/copy/paste files between directories
- Use "Move to" and "Copy to" dialogs for more contextual organization
- Edit file permissions
- View images, videos, and audio files in the browser
    - File size limitations apply (see [here](https://github.com/CyberGen49/sftp-browser/blob/53ad712089774c7264157d64dc94c6084950812b/web/assets/main.js#L168) - subject to change)
- Edit text files in the browser and save directly to the server
    - Syntax highlighting is supported for certain languages
- Edit Markdown files and see a live preview
- Full mobile support with a responsive UI

## API

### Authentication
All API endpoints require a set of request headers for connecting to the target server:
* `sftp-host`: The hostname of the server
* `sftp-port`: The port of the server
* `sftp-username`: The username to log into
* `sftp-password`: The password, if using password authentication
* `sftp-key`: The **private** key, if using public key authentication

### Response format
All API responses are in JSON format and include a boolean `success` property. This is `true` if no errors were encountered, or `false` otherwise. If an error was encountered, a string `error` property is included, which contains an error description.

Successful response example:
```json
{
    "success": true,
    "...": "..."
}
```

Failed response example:
```json
{
    "success": false,
    "error": "[error description]",
    "...": "..."
}
```

Failed responses will always use a 400 or 500 level HTTP status code.

### Endpoints

#### `GET /api/sftp/directories/list`
Gets the immediate contents of a directory.

##### Query params
* Required string `path`: The target directory path
* Optional boolean `dirsOnly`: If `true`, only directories will be returned

##### Successful response
* string `path`: The normalized path
* object[] `list`: An array of file objects
    * string `list[].name`: The name of this file
    * number `list[].accessTime`: A timestamp representing the last access time of this file
    * number `list[].modifyTime`: A timestamp representing the last modification time of this file
    * number `list[].size`: The size, in bytes, of this file
    * string `list[].type`: A 1-character string representing the [type](https://www.computernetworkingnotes.com/linux-tutorials/different-types-of-files-in-linux.html) of this file
    * number `list[].group`: The ID of the group this file belongs to
    * number `list[].owner`: The ID of the user this file belongs to
    * object `list[].rights`: Permissions for this file
        * string `list[].rights.user`: Contains some arrangement of `r`, `w`, and `x`, representing the permissions the owner has for this file.
        * string `list[].rights.group`: Contains some arrangement of `r`, `w`, and `x`, representing the permissions the group has for this file.
        * string `list[].rights.other`: Contains some arrangement of `r`, `w`, and `x`, representing the permissions everyone else has for this file.
    * string `list[].longname`: The raw SFTP output representing this file

#### `POST /api/sftp/directories/create`
Creates a directory.

##### Query params
* Required string `path`: The new directory path

##### Successful response
* string `path`: The normalized path

#### `DELETE /api/sftp/directories/delete`
Deletes a directory and its contents.

##### Query params
* Required string `path`: The path of the directory to delete

##### Successful response
* string `path`: The normalized path

#### `GET /api/sftp/files/exists`
Checks if a path exists.

##### Query params
* Required string `path`: The path to check

##### Successful response
* string `path`: The normalized path
* boolean `exists`: `true` if the path exists, `false` otherwise
* string|boolean `type`: If the file exists, this is its [type](https://www.computernetworkingnotes.com/linux-tutorials/different-types-of-files-in-linux.html) character. If it doesn't exist, this is `false`.

#### `GET /api/sftp/files/stat`
Gets the details about a file or directory.

##### Query params
* Required string `path`: The path to stat

##### Successful response
* string `path`: The normalized path
* object `stats`: The stats for the file
    * number `accessTime`: The time the file was last accessed
    * number `modifyTime`: The time the file was last modified
    * number `size`: The size of the file
    * number `uid`: The ID of the file's owner
    * number `gid`: The ID of the file's group
    * number `mode`: An integer representing the file's type and permissions
    * boolean `isBlockDevice`: `true` if the file is a block device, `false` otherwise
    * boolean `isCharacterDevice`: `true` if the file is a character, `false` otherwise
    * boolean `isDirectory`: `true` if the file is a directory, `false` otherwise
    * boolean `isFIFO`: `true` if the file is a first-in first-out file, `false` otherwise
    * boolean `isSocket`: `true` if the file is a socket, `false` otherwise
    * boolean `isSymbolicLink`: `true` if the file is a symlink, `false` otherwise

#### `GET /api/sftp/files/get/single`
Gets raw file data.

##### Query params
* Required string `path`: The path of the file

##### Successful response
*The raw file data*

##### Failed response
*An error response in JSON*

#### `GET /api/sftp/files/get/single/url`
Gets a temporary URL to download a single file without the need for connection headers. These URLs last 24 hours or until the server is restarted.

##### Query params
* Required string `path`: The path of the file

##### Successful response
* string `path`: The normalized path
* string `download_url`: The resulting download URL

#### `GET /api/sftp/files/get/multi`
Gets a temporary URL for downloading a set of files and directories as a zip archive without the need for connection headers.

##### Query params
* Required string[] `paths`: A JSON-formatted array of file or directory paths

##### Successful response
* string `path`: The normalized path
* string `download_url`: The resulting download URL

#### `POST /api/sftp/files/create`
Creates a file and appends the raw request body to it.

##### Query params
* Required string `path`: The path of the new file

##### Request body
*The raw data to insert into the new file*

##### Successful response
* string `path`: The normalized path

#### `PUT /api/sftp/files/append`
Appends the raw request body to a file, creating it if it doesn't exist.

##### Query params
* Required string `path`: The path of the file

##### Request body
*The raw data to append to the file*

##### Successful response
* string `path`: The normalized path

#### `PUT /api/sftp/files/move`
Moves a file or directory from one location to another.

##### Query params
* Required string `pathOld`: The current path
* Required string `pathNew`: The new path

##### Successful response
* string `pathOld`: The normalized old path
* string `pathNew`: The normalized new path

#### `PUT /api/sftp/files/copy`
Copies a file from one location to another. Directories not supported.

##### Query params
* Required string `pathSrc`: The source path
* Required string `pathDest`: The destination path

##### Successful response
* string `pathSrc`: The normalized source path
* string `pathDest`: The normalized destination path

#### `PUT /api/sftp/files/chmod`
Changes a file's permissions. Directories are supported, but with no recursion.

##### Query params
* Required string `path`: The path of the file
* Required string `mode`: The new mode to apply, in the form of `xyz`, where `x`, `y`, and `z` are integers from 0 to 7

##### Successful response
* string `path`: The normalized path
* string `mode`: The mode that was supplied

#### `DELETE /api/sftp/files/delete`
Deletes a file.

##### Query params
* Required string `path`: The path of the file

##### Successful response
* string `path`: The normalized path