/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

const fs = require("fs");

fs.readdir("worlds", function (err, files) {
  for (i in files) {
    let file = files[i];
    console.log("Backuping and minifying world " + file);
    fs.copyFile(
      "worlds/" + file + "/source.json",
      "worlds/" + file + "/source.bak.json",
      function (err) {
        if (err) throw err;
        console.log("Reading world " + file);
        fs.readFile("worlds/" + file + "/source.json", function (err, data) {
          let json = JSON.parse(data);
          fs.writeFile(
            "worlds/" + file + "/source.json",
            JSON.stringify(json),
            function (err) {
              if (err) throw err;
              console.log("World " + file + " has been minified!");
            },
          );
        });
      },
    );
  }
});
