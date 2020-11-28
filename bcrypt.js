const bcrypt = require("bcrypt");

const pwd = process.argv[2];
bcrypt.genSalt(10, function(err, salt) {
	bcrypt.hash(pwd, salt, function(err, hash) {
		console.log(pwd + " -> " + hash);
	});
});
