const fs = require("fs");
const express = require("express");
const url = require("url");

MAX_WORLD_LIMIT = 100;

// Functions exported to global //
processUserWorld = function(meta) {
	let user = userMetadata(meta["author_id"].toString());
	meta["author_username"] = user.username;
	meta["author_profile_image_url"] = user["profile_image_url"];
	meta["author_status"] = user["user_status"];
	meta["author_blocksworld_premium"] = (user["blocksworld_premium"] != 0);
	if (meta["is_blog_post"] == true) {
		meta["description"] = fs.readFileSync("worlds/" + meta["id"] + "/description.txt", {"encoding": "utf8"});
	}
	if (user["account_type"]) {
		meta["author_account_type"] = user["account_type"];
	}
	return meta;
}

fullWorld = function(callback, id, source) {
	if (!fs.existsSync("worlds/" + id)) {
		callback(null);
		return;
	}
	fs.readFile("worlds/" + id + "/metadata.json", function(err, data) {
		if (err) {
			callback(err, null);
		} else {
			let metadata = JSON.parse(data);
			metadata["id"] = parseInt(id);
			if (source) {
				fs.readFileSync("worlds/" + id + "/source.json", function(e, d) {
					metadata["source_json_str"] = d;
					callback(null, metadata);
				});
			} else {
				callback(null, metadata);
			}
		}
	});
}

fullWorldSync = function(id, noSource) {
	let world = {
		id: id.toString()
	}
	if (!fs.existsSync("worlds/" + id)) {
		return null;
	}
	let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
	for (key in metadata) {
		world[key] = metadata[key];
	}
	if (noSource == undefined || noSource == null) {
		world["source_json_str"] = fs.readFileSync("worlds/"+id+"/source.json",{"encoding":"utf8"});
	}
	world = processUserWorld(world);
	return world;
}

// Module code //
function world(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		res.status(200).json({
			"world": fullWorldSync(id)
		});
	} else {
		res.status(404).json({
			"error": 404,
			"error_msg": "Not Found"
		});
	}
}

function deleteWorld(req, res) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing auth token"
		});
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	let id = req.params.id
	if (fs.existsSync("worlds/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
		if (metadata["author_id"] == userId) {
			fs.unlinkSync("worlds/"+id+"/metadata.json");
			fs.unlinkSync("worlds/"+id+"/source.json");
			try {
				fs.unlinkSync("images/"+id+".png");
			} catch (e) {
				console.err("Failed to delete images/"+id+".png")
			}
			fs.rmdirSync("worlds/"+id);
			let usr = userMetadata(userId)
			for (i in usr["_SERVER_worlds"]) {
				if (usr["_SERVER_worlds"][i] == id) {
					usr["_SERVER_worlds"].splice(i, 1);
				}
			}
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
			res.status(200).json({});
		}
	}
}

function worldBasicInfo(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		res.status(200).json(
			fullWorldSync(id, true)
		);
	} else {
		res.status(404).json({
			"error": 404,
			"error_msg": "Not Found"
		});
	}
}

function publicationStatus(req, res) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing auth token"
		});
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	if (req.body == undefined || req.body == null) {
		res.status(403).json({
			"error": "no body"
		});
		return;
	}
	let id = req.params.id
	if (fs.existsSync("worlds/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json", {"encoding": "utf8"}));
		if (metadata["author_id"] == userId) {
			if (req.body.is_published == "true") {
				metadata["publication_status"] = 1;
				if (metadata["first_published_at"] == metadata["created_at"]) {
					metadata["first_published_at"] = dateString();
					let feed = {
						"type": 201,
						"timestamp": metadata["first_published_at"],
						"world_id": parseInt(id),
						"world_image_urls_for_sizes": metadata["image_urls_for_sizes"],
						"world_title": metadata["title"]
					}
					addFeed(userId, feed);
				}
			} else {
				metadata["publication_status"] = 5;
			}
			fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(metadata));
			res.status(200).json(fullWorldSync(id));
		} else {
			res.status(400).json({
				"error": "not owner"
			})
		}
	}
}

function createWorld(req, res) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing auth token"
		});
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	if (req.body == undefined || req.body == null) {
		res.status(403).json({
			"error": "no body"
		});
		return;
	}
	let user = userMetadata(userId);
	if (user["_SERVER_worlds"].length > MAX_WORLD_LIMIT) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Too many worlds created."
		});
		return;
	}
	fs.readFile("conf/new_world_id.txt", {"encoding": "utf8"}, function(err, data) {
		if (err != null)
			console.log(err);
		let newId = data;
		fs.writeFile("conf/new_world_id.txt", (parseInt(newId)+1).toString(), function(err) {
			if (err != null)
				console.log(err);
		});
		let currDateStr = dateString();
		let metadata = {
			"title": req.body["title"][0],
			"description": req.body["description"][0],
			"has_win_condition": req.body["has_win_condition"][0],
			"category_ids": JSON.parse(req.body["category_ids_json_str"][0]),
			"author_id": parseInt(userId),
			"publication_status": 5,
			"app_version": req.headers["bw-app-version"],
			"average_star_rating": 0,
			"likes_count": 0,
			"play_count": 0,
			"pay_to_play_cost": 0,
			"image_urls_for_sizes": {
				"440x440": HOST + "/images/"+newId+".png",
				"512x384": HOST + "/images/"+newId+".png",
				"220x220": HOST + "/images/"+newId+".png",
				"1024x768": HOST + "/images/"+newId+".png"
			},
			"created_at": currDateStr,
			"first_published_at": currDateStr,
			"updated_at": currDateStr
		};
		let source = req.body["source_json_str"];

		fs.mkdirSync("worlds/"+newId)
		fs.writeFileSync("worlds/"+newId+"/metadata.json", JSON.stringify(metadata));
		fs.writeFileSync("worlds/"+newId+"/source.json", source);
		let usr = userMetadata(userId)
		usr["_SERVER_worlds"].push(newId);
		fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
		if (req.files["screenshot_image"]) {
			fs.copyFileSync(req.files["screenshot_image"][0].path, "images/"+newId+".png");
		}
		res.status(200).json({
			"world": fullWorldSync(newId)
		});
	});
}

function updateWorld(req, res) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing auth token"
		});
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id) && req.body != null) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
		if (metadata["author_id"] == userId) {
			console.debug(req.files);
			if (req.body["source_json_str"]) {
				fs.writeFileSync("worlds/"+id+"/source.json", req.body["source_json_str"]);
			}
			if (req.body["has_win_condition"]) {
				let v = req.body["has_win_condition"]
				if (typeof(v) === "object") {
					v = v[0]
				}
				metadata["has_win_condition"] = (v == "true");
			}
			if (req.body["title"]) {
				let v = req.body["title"]
				if (typeof(v) === "object") {
					v = v[0]
				}
				metadata.title = v;
			}
			if (req.body["description"]) {
				let v = req.body["description"]
				if (typeof(v) === "object") {
					v = v[0]
				}
				metadata.description = v;
			}
			if (req.body["category_ids_json_str"]) {
				let v = req.body["category_ids_json_str"]
				if (typeof(v) === "object") {
					v = v[0]
				}
				metadata["category_ids"] = JSON.parse(v);
			}
			if (req.files["screenshot_image"]) {
				try {
					fs.copyFileSync(value2(req.files["screenshot_image"]).path, "images/"+id+".png");
				} catch (e) {
					// TODO: handle
					console.debug(e);
				}
			}
			if (metadata["publication_status"] == 1) {
				let feed = {
					"type": 202,
					"timestamp": metadata["first_published_at"],
					"world_id": parseInt(id),
					"world_image_urls_for_sizes": metadata["image_urls_for_sizes"],
					"world_title": metadata["title"]
				}
				addFeed(userId, feed);
			}
			metadata["updated_at"] = dateString();
			let metaStr = JSON.stringify(metadata)
			fs.writeFile("worlds/"+id+"/metadata.json", metaStr, function(err) {
				if (err != null)
					console.log("file error for world update: " + err);
				res.status(200).json({
					"world": fullWorldSync(id)
				});
			});
		} else {
			res.status(403).json({
				"error": "not owning the world"
			});
		}
	} else {
		res.status(404);
	}
}

function worldsGet(req, res, u) {
	let page = u.query.page;
	let categoryId = u.query.category_id;
	let search = u.query.search;
	let kind = u.query.kind;
	if (kind == undefined) {
		kind = "recent";
	}
	if (page === undefined) {
		page = 0;
	} else {
		page = Math.max(0,parseInt(page)-1);
	}
	fs.readdir("worlds", function(err, files) {
		if (kind == "arcade") { // Hall of Fame
			files = files.map(function (fileName) {
				let json = JSON.parse(fs.readFileSync("worlds/"+fileName+"/metadata.json"));
				let rate = json["average_star_rating"];
				if (rate == 0) {
					rate = 3;
				}
				return {
					name: fileName,
					time: parseInt(json["play_count"]) * rate
				}
			});
		} else if (kind == "most_popular") { // Popular
			files = files.map(function (fileName) {
				let json = JSON.parse(fs.readFileSync("worlds/"+fileName+"/metadata.json"));
				let rate = json["average_star_rating"];
				if (rate == 0) {
					rate = 3;
				}
				return {
					name: fileName,
					time: new Date(json["first_published_at"]).getTime() + ((parseInt(json["play_count"]) * 29000000) * rate)
				}
			});
		} else if (kind == "featured") { // Should be only 1 world, the world shown in big at top.
			files = files.map(function (fileName) {
				let json = JSON.parse(fs.readFileSync("worlds/"+fileName+"/metadata.json"));
				let rate = json["average_star_rating"];
				if (rate == 0) {
					rate = 3;
				}
				return {
					name: fileName,
					time: new Date(json["first_published_at"]).getTime() + ((parseInt(json["play_count"]) * 290000000) * rate)
				}
			});
		} else { // "recent" and "unmoderated"
			files = files.map(function (fileName) {
				let json = JSON.parse(fs.readFileSync("worlds/"+fileName+"/metadata.json"));
				let date = new Date(json["first_published_at"]);
				if (json["first_published_at"] == undefined || isNaN(date.getTime())) {
					date = fs.statSync("worlds/" + fileName + "/metadata.json").birthtimeMs
				} else {
					date = date.getTime();
				}
				return {
					name: fileName,
					time: date
				}
			});
		}
		files = files.sort(function (a, b) {
			return b.time - a.time;
		}).map(function(v) {
			return v.name;
		});
		let json = {};
		let obj = [];
		let publishedWorlds = [];
		for (i in files) {
			let world = {
				id: files[i]
			}
			if (parseInt(files[i]) < 0) { // probably status update world
				continue;
			}
			let metadata = null;
			try {
				metadata = JSON.parse(fs.readFileSync("worlds/"+files[i]+"/metadata.json"));
			} catch (e) {
				metadata = null;
			}
			let cond = true;
			if (req.params) {
				if (req.params.user) {
					cond = metadata["author_id"] == req.params.user;
				}
			}
			if (search) {
				if (cond == true) {
					search = search.toString().toLowerCase();
					if (search.startsWith("id:")) {
						cond = (metadata["id"].toString() == search.split(":")[1]);
					} else if (search.startsWith("madebyid:")) {
						cond = (metadata["author_id"].toString() == search.split(":")[1]);
					} else if (search.startsWith("madeby:")) {
						cond = (userMetadata(metadata["author_id"])["username"].search(search.split(":")[1]) != -1);
					} else {
						cond = (metadata["title"].toLowerCase().search(search) != -1);
					}
				}
			}
			if (metadata["publication_status"] == 1 && cond) {
				for (key in metadata) {
					world[key] = metadata[key];
				}
				if (categoryId != undefined && world["category_ids"].indexOf(parseInt(categoryId)) == -1) {
					continue;
				}
				world = processUserWorld(world);
				publishedWorlds.push(world);
			}
		}
		let start = Math.min(publishedWorlds.length, 24*page);
		let end = Math.min(publishedWorlds.length, start+24);
		for (i=start; i < end; i++) {
			obj.push(publishedWorlds[i]);
		}
		json["worlds"] = obj;
		if (end < publishedWorlds.length) {
			json["pagination_next_page"] = page + 2; // + 2 because it got substracted by 1 before
		}
		res.status(200).json(json);
	});
}

function playWorld(req, res) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing auth token"
		});
		return;
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(403).json({
			"error": "unauthentificated user"
		});
		return;
	}
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id) && req.body != null) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
		let playedWorlds = JSON.parse(fs.readFileSync("users/"+userId+"/played_worlds.json"))
		if (playedWorlds["worlds"].indexOf(parseInt(id)) == -1) {
			metadata["play_count"] += 1;
			let metaStr = JSON.stringify(metadata);
			fs.writeFile("worlds/"+id+"/metadata.json", metaStr, function(err) {
				if (err != null)
					console.log("file error for world update: " + err);
			});
			playedWorlds["worlds"].push(parseInt(id))
			let playStr = JSON.stringify(playedWorlds)
			fs.writeFile("users/"+userId+"/played_worlds.json", playStr, function(err) {
				if (err != null)
					console.log("file error for world update: " + err);
			});
		}
		res.status(200);
	}
}

module.exports.run = function(app) {
	if (!fs.existsSync("worlds")) {
		fs.mkdirSync("worlds");
		console.log("Created folder \"worlds\"");
	}
	if (!fs.existsSync("conf/new_world_id.txt")) {
		fs.writeFileSync("conf/new_world_id.txt", "1")
		console.log("Created file \"conf/new_world_id.txt\"");
	}
	app.delete("/api/v1/worlds/:id", deleteWorld);
	app.get("/api/v1/worlds/:id/basic_info", worldBasicInfo);
	app.get("/api/v1/worlds/:id", world);
	app.post("/api/v1/worlds", createWorld);
	app.put("/api/v1/worlds/:id", updateWorld);
	app.post("/api/v1/worlds/:id/plays", playWorld);
	app.get("/api/v1/worlds/:id/source_for_teleport", world);

	app.put("/api/v1/worlds/:id/published_status", express.urlencoded({"extended":false}), publicationStatus);
	app.get("/api/v1/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	});
	app.get("/api/v1/users/:user/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	})

	app.get("/api/v1/current_user/world_star_rating/:id", function(req, res) {
		let valid = validAuthToken(req, res, true);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let id = req.params.id;
		if (fs.existsSync("worlds/" + id)) {
			let ratings = JSON.parse(fs.readFileSync("users/" + userId + "/world_ratings.json"));
			let json = {
				"average_star_rating": fullWorldSync(id, true)["average_star_rating"]
			}
			if (ratings.ratings[parseInt(id)]) {
				json["star_rating"] = ratings.ratings[parseInt(id)];
			}
			res.status(200).json(json);
		} else {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such world"
			});
		}
	});

	app.post("/api/v1/current_user/world_star_rating/:id", function(req, res) {
		let valid = validAuthToken(req, res, true);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let id = parseInt(req.params.id);
		let stars = parseInt(req.body.stars);
		if (fs.existsSync("worlds/" + id)) {
			let ratings = JSON.parse(fs.readFileSync("users/" + userId + "/world_ratings.json"));
			let meta = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
			if (ratings.ratings[id]) {
				// remove the rating from the average
				// Expressions (n=average, a=old average, b=user rating):
				// n=(a+b)/2
				// a=n*2-b
				meta["average_star_rating"] = (meta["average_star_rating"] * 2) - ratings.ratings[id];
			}
			if (meta["average_star_rating"] == 0) {
				meta["average_star_rating"] = stars;
			}
			meta["average_star_rating"] = (meta["average_star_rating"] + stars) / 2;
			fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(meta));
			ratings.ratings[id] = stars;
			fs.writeFileSync("users/" + userId + "/world_ratings.json", JSON.stringify(ratings));
			let json = {
				"average_star_rating": fullWorldSync(id, true)
			}
			if (ratings.ratings[id]) {
				json["star_rating"] = ratings.ratings[id];
			}
			res.status(200).json(json);
		} else {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such world"
			});
		}
	});
}