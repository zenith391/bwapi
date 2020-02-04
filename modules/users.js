const fs = require("fs");
const url = require("url");

// Functions exported to global //
userMetadata = function(id) {
	let metadata = JSON.parse(fs.readFileSync("users/"+id+"/metadata.json"));
	return metadata;
}

// Module code //
function basic_info(req, res) {
	let userId = req.params.id
	let metadata = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
	let json = {
		"id": metadata.id,
		"username": metadata.username,
		"is_username_blocked": metadata.is_username_blocked,
		"is_image_locked": metadata.is_image_locked,
		"user_status": metadata.user_status,
		"blocksworld_premium": metadata.blocksworld_premium,
		"profile_image_url": metadata.profile_image_url
	}
	res.status(200).json(json);
}

function save_current_user_profile_world(req, res) {
	let authToken = getAuthToken(req)
	if (authToken === undefined) {
		res.status(400);	// different from official implementation
		res.json({
			"error": 400,
			"error_msg": "Missing auth token"
		});			// the official just end the connection
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	console.log("User with token " + authToken + " uploading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	if (req.body["source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/source.json", req.body["source_json_str"]);
	}
	if (req.body["avatar_source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/avatar_source.json", req.body["avatar_source_json_str"]);
	}
	if (req.body["profile_gender"]) {
		meta["profile_gender"] = req.body["profile_gender"];
	}
	meta["updated_at_timestamp"] = Date.now();
	fs.writeFileSync("users/"+userId+"/profile_world/metadata.json", JSON.stringify(meta));
	let userMeta = userMetadata(userId)
	if (userMeta["is_image_locked"] != true) {
		if (req.files["profile_image"]) {
			fs.copyFileSync(req.files["profile_image"][0].path, "images/profiles/"+userId+".jpg");
			userMeta["profile_image_url"] = "https://bwsecondary.ddns.net:8080/images/profiles/"+userId+".jpg";
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
		}
	}
	res.status(200).json(userMeta);
}

function current_user_profile_world(req, res) {
	let authToken = getAuthToken(req)
	if (authToken === undefined) {
		res.status(400);	// different from official implementation
		res.json({
			"error": 400,
			"error_msg": "Missing auth token"
		});			// the official just end the connection
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	console.log("User with token " + authToken + " downloading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let userMeta = userMetadata(userId);
	let src = fs.readFileSync("users/"+userId+"/profile_world/source.json",{"encoding":"utf8"});
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	meta["image_url"] = userMeta["profile_image_url"];
	meta["source_json_str"] = src
	if (fs.existsSync("users/"+userId+"/profile_world/avatar_source.json")) {
		meta["avatar_source_json_str"] = fs.readFileSync("users/"+userId+"/profile_world/avatar_source.json",{"encoding":"utf8"});
	}
	meta = processUserWorld(meta)
	res.status(200).json(meta);
}

function current_user_worlds(req, res) {
	let is_published = url.parse(req.url, true).query.is_published
	let authToken = getAuthToken(req)
	if (authToken === undefined) {
		res.status(400);	// different from official implementation
		res.json({
			"error": 400,
			"error_msg": "Missing auth token"
		});			// the official just end the connection
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	console.log("User with token " + authToken + " downloading his worlds.");
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
	user.worlds = [];
	for (i in user["_SERVER_worlds"]) {
		let id = user["_SERVER_worlds"][i];
		try {
			let w = fullWorldSync(id, true);
			if (is_published == "yes") {
				if (w.publication_status == 1) {
					user.worlds.push(w);
				}
			} else {
				user.worlds.push(w);
			}
		catch (e) {
			console.debug(e);
			console.error("could not retrieve wolrds for user " + userId + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}
	user["_SERVER_worlds"] = undefined;
	user["_SERVER_models"] = undefined;
	res.status(200).json(user);
}

module.exports.run = function(app) {
	app.get("/api/v1/current_user/worlds", current_user_worlds);
	app.get("/api/v1/current_user/worlds_for_teleport", current_user_worlds);
	app.get("/api/v1/current_user/profile_world", current_user_profile_world);
	app.put("/api/v1/current_user/profile_world", save_current_user_profile_world);

	app.get("/api/v1/current_user/pending_payouts", function(req, res) {
		res.status(200).json({
			"pending_payouts": []
		})
	});

	app.get("/api/v1/current_user/deleted_worlds", function(req, res) {
		res.status(200).json({
			"worlds": []
		});
	});

	app.get("/api/v1/users/:id/basic_info", basic_info);
}