// to test do: "node --inspect-brk ./src/scripts/makeLink.js

const fs = require('fs');
const path = require('path');

// console.log(`Current folder ${__dirname}`);

const sourceFolder = path.join(__dirname, '../../../src/utilities/shared/');
const linkFolder = path.join(__dirname, '../utilities/shared');

if (!fs.existsSync(linkFolder)) {
  try {
    fs.mkdirSync(linkFolder, { recursive: true });
  } catch (e) {
    console.error("Error creating folder: '${linkFolder}", e);
    process.exit(1); // Exit with error code (1)
  }
}

//Users/blm0/Development/VsCode/checking-extension/src/utilities

fs.readdirSync(sourceFolder).forEach(file => {
  if (file.endsWith('.ts')) {
    const sourceFile = path.join(sourceFolder, file);
    const linkFile = path.join(linkFolder, file);

    try {
      if (!fs.existsSync(linkFile)) {
        try {
          fs.linkSync(sourceFile, linkFile);
          console.log(`Created hard link: ${linkFile} → ${sourceFile}`);
        } catch (e) {
          console.error("Error creating link from file: '${sourceFile}", e);
          process.exit(1); // Exit with error code (1)
        }
      } else {
        console.log(`Hard link already exists: ${linkFile}`);
      }
    } catch (e) {
      console.error("Error verifying file: '${linkFile}", e);
      process.exit(1); // Exit with error code (1)
    }
  }
});
