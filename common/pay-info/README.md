In order to use this module in the electron client, you will need to do:

```
npm install
npm run build
```

The site directory has its own webpack configuration set up to build this module for its own use, so this step isn't needed to use it there.

TODO: Find a way to get the build step to happen when the module is installed for use anywhere. Adding:

```
"install": "npm run build"
```

...to the scripts section of package.json does do this, but the resulting build generates a file that causes the electron client to complain that it doesn't know how to handle the file type.
