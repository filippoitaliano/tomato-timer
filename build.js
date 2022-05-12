const fs = require('fs');
const UglifyJs = require("uglify-js");
const HtmlParser = require('node-html-parser');

if (!fs.existsSync('./dist')) fs.mkdirSync('./dist')

const callback = (error) => error ? console.error(error) : console.log('✔');

fs.copyFile('./src/ding.mp3', './dist/ding.mp3', callback);
fs.copyFile('./src/style.css', './dist/style.css', callback);
fs.copyFile('./src/favicon.ico', './dist/favicon.ico', callback);
fs.copyFile('./src/timerWorker.js', './dist/timerWorker.js', callback);

const jsCode = fs.readFileSync("./src/logic.js", "utf8");
const uglifyOptions = { mangle: { toplevel: true }, nameCache: {} };
const uglifyResult = UglifyJs.minify(jsCode, uglifyOptions);

fs.writeFileSync("./dist/logic.js", uglifyResult.code);

const mangleMap = uglifyOptions.nameCache.vars.props;

const htmlCode = fs.readFileSync('./src/index.html').toString();
const parsedHtml = HtmlParser.parse(htmlCode);

const elementsWithJs = parsedHtml.querySelectorAll('.wjs');
elementsWithJs.forEach((element) => {
  const attributeValue = element.getAttribute('onclick');
  const identifier = `$${attributeValue.substring(0, attributeValue.length - 2)}`;
  const mangledIdentifier = `${mangleMap[identifier]}()`;
  element.setAttribute('onclick', mangledIdentifier);
});

fs.writeFileSync('./dist/index.html', parsedHtml.toString());
