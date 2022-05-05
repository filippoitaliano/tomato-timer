const fs = require('fs');
const UglifyJS = require("uglify-js");

if (!fs.existsSync('./dist')){
  fs.mkdirSync('./dist');
}

fs.copyFile('./src/ding.mp3', './dist/ding.mp3', console.error);
fs.copyFile('./src/index.html', './dist/index.html', console.error);
fs.copyFile('./src/style.css', './dist/style.css', console.error);

const code = fs.readFileSync("./src/logic.js", "utf8");
const minifiedCode = UglifyJS.minify(code, { mangle: { toplevel: false } }).code;
fs.writeFileSync("./dist/logic.js", minifiedCode);
