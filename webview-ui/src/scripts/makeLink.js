// to test do: "node --inspect-brk ./src/scripts/makeLink.js

const fs = require('fs');
const path = require('path');

// console.log(`Current folder ${__dirname}`);

const linkPath = path.join(__dirname, '../utilities/shared');
const targetPath = path.join(__dirname, '../../../src/utilities/shared/');

if (!fs.existsSync(linkPath)) {
  if (fs.existsSync(targetPath)) {
    try {
      fs.symlinkSync(targetPath, linkPath, "dir");
      console.log(`Symlink at '${linkPath}' created successfully!`);
    } catch (err) {
      console.error("Error creating symlink: '${linkPath}", err);
      process.exit(1); // Exit with error code (1)
    }
  } else {
    console.error(`target path does not exist: '${targetPath}'`);
    process.exit(1); // Exit with error code (1)
  }
} else {
  try {
    const stats = fs.lstatSync(linkPath);
    if (stats.isSymbolicLink()) {
      console.log(`Symlink already exists at '${linkPath}'`);
    } else {
      console.error(`'${linkPath}' - This is a regular folder.`);
      process.exit(1); // Exit with error code (1)
    }
  } catch (err) {
    console.error(`Error validating: '${linkPath}'`, err);
    process.exit(1); // Exit with error code (1)
  }
}
