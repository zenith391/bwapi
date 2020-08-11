const fs = require("fs");

fs.readdir("worlds", function(err, files) {
	for (i in files) {
		let file = files[i];
		console.log("Deleting backup of world " + file);
		fs.unlink("worlds/" + file + "/source.bak.json", function(err) {
			if (err) throw err;
			console.log("Backup of world " + file + " deleted!");
		});
	}
});
