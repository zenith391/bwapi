const fs = require("fs");

fs.readdir("worlds", function(err, files) {
	for (i in files) {
		let file = files[i];
		console.log("Backuping and minifying world " + file);
		fs.copyFile("worlds/" + file + "/source.json", "worlds/" + file + "/source.bak.json", function(err) {
			if (err) throw err;
			console.log("Reading world " + file)
			fs.readFile("worlds/" + file + "/source.json", function(err, data) {
				let json = JSON.parse(data);
				fs.writeFile("worlds/" + file + "/source.json", JSON.stringify(json), function(err) {
					if (err) throw err;
					console.log("World " + file + " has been minified!");
				});
			});
		})
	}
});
