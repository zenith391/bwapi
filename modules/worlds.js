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
const express = require("express");
const url = require("url");
let featuredWorldId = 1;

// Functions exported to global
processUserWorld = function(meta) {
	if (meta["author_id"] == 0) {
		meta["author_username"] = "Corrupted";
		meta["author_profile_image_url"] = "corrupted";
		meta["author_status"] = 0;
		meta["author_blocksworld_premium"] = false;
		meta["author_account_type"] = "user"
	} else {
		let user = userMetadata(meta["author_id"].toString());
		meta["author_username"] = user.username;
		meta["author_profile_image_url"] = user["profile_image_url"];
		meta["author_status"] = user["user_status"];
		//meta["author_blocksworld_premium"] = (user["blocksworld_premium"] != 0);
		meta["author_blocksworld_premium"] = false; // nobody has Premium here, since nobody pays
		if (meta["is_blog_post"] == true) {
			meta["description"] = fs.readFileSync("worlds/" + meta["id"] + "/description.txt", {"encoding": "utf8"});
		}
		if (user["account_type"]) {
			meta["author_account_type"] = user["account_type"];
		}
	}
	return meta;
}

fullWorld = function(id, source, callback) {
	if (!fs.existsSync("worlds/" + id)) {
		callback(new Error("World not found."));
		return;
	}
	fs.readFile("worlds/" + id + "/metadata.json", function(err, data) {
		if (err) {
			callback(err, null);
		} else {
			let metadata = JSON.parse(data);
			metadata["id"] = parseInt(id);
			if (!metadata["required_mods"]) metadata["required_mods"] = [];
			if (source) {
				fs.readFile("worlds/" + id + "/source.json", function(e, d) {
					metadata["source_json_str"] = d.toString();
					if (!metadata["publication_status"]) {
						metadata["publication_status"] = 5;
					}
					if (!metadata["title"]) {
						metadata["title"] = "";
					}
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
	if (!world["required_mods"]) world["required_mods"] = [];
	if (noSource === undefined || noSource == null) {
		world["source_json_str"] = fs.readFileSync("worlds/"+id+"/source.json",{"encoding":"utf8"});
	}
	world = processUserWorld(world);
	return world;
}

let allWorldsCache = {};
let allWorldsCacheValid = false;
let allWorldsCacheLoading = false;
worldCache = function(callback) {
	if (!allWorldsCacheValid) {
		if (allWorldsCacheLoading) {
			console.log("Tried loading world cache at the same time!");
		}
		allWorldsCacheLoading = true;
		console.debug("Populating world cache..");
		fs.readdir("worlds", function(err, files) {
			if (err) callback(err, null);

			for (i in files) {
				let file = files[i];
				try {
					let json = JSON.parse(fs.readFileSync("worlds/"+file+"/metadata.json"));
					json["id"] = parseInt(file);
					if (!json["required_mods"]) json["required_mods"] = [];
					try {
						json = processUserWorld(json);
					} catch (e) {
						console.error("Error parsing metadata:");
						console.error(e);
					}
					allWorldsCache[json["id"]] = json;
				} catch (e) {
					// try to recover world
					console.error("Had to recover world " + file + "!");
					let currDateStr = dateString();
					fs.writeFileSync("worlds/"+file+"/metadata.json", JSON.stringify({
						"title": "",
						"average_star_rating": 0,
						"description": "",
						"has_win_condition": false,
						"category_ids": [],
						"author_id": 0, // TODO
						"app_version": "1.47.0",
						"publication_status": 5,
						"likes_count": 0,
						"play_count": 0,
						"pay_to_play_cost": 0,
						"image_urls_for_sizes": {
							"440x440": HOST + "/images/"+file+".png",
							"512x384": HOST + "/images/"+file+".png",
							"220x220": HOST + "/images/"+file+".png",
							"1024x768": HOST + "/images/"+file+".png"
						},
						"created_at": currDateStr,
						"first_published_at": currDateStr,
						"updated_at": currDateStr
					}))
				}
			}
			console.debug(files.length + " worlds found.");
			callback(null, allWorldsCache);
		})
		allWorldsCacheValid = true;
		allWorldsCacheLoading = false;
	} else {
		callback(null, allWorldsCache);
	}
}

isWorldCacheValid = function() {
	return allWorldsCacheValid;
}

invalidateWorldCache = function() {
	allWorldsCache = {};
	allWorldsCacheValid = false;
}

// Module code //
function world(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		fullWorld(id, true, function(err, world) {
			if (err) {
				throw err;
			}
			world["number_of_raters"] = undefined;
			res.status(200).json({
				"world": processUserWorld(world)
			})
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
			let usr = userMetadata(userId);
			for (i in usr["_SERVER_worlds"]) {
				if (usr["_SERVER_worlds"][i] == id) {
					usr["_SERVER_worlds"].splice(i, 1);
				}
			}
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
			if (allWorldsCacheValid) {
				delete allWorldsCache[id];
			}
			res.status(200).json({
				"success": true
			});
		}
	}
}

function worldBasicInfo(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		fullWorld(id, false, function(err, world) {
			if (err) {
				throw err;
			}
			res.status(200).json(processUserWorld(world));
		});
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
		console.log("missing auth token");
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
		console.log("no body");
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
			allWorldsCache[id] = metadata;
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
		console.log("no body, body = " + req.body);
		res.status(403).json({
			"error": "no body"
		});
		return;
	}
	let user = userMetadata(userId);
	if (user["_SERVER_worlds"].length > MAX_WORLD_LIMIT) {
		console.log(user["username"] + " has too many worlds.");
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
		let requiredMods = value(req.body, "required_mods_json_str");
		if (!requiredMods) {
			requiredMods = [];
		} else {
			requiredMods = JSON.parse(requiredMods);
		}
		let metadata = {
			"title": value(req.body, "title"),
			"description": value(req.body, "description"),
			"has_win_condition": value(req.body, "has_win_condition") == "true",
			"category_ids": JSON.parse(value(req.body, "category_ids_json_str")),
			"required_mods": requiredMods,
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
		let source = value(req.body, "source_json_str");

		fs.mkdirSync("worlds/"+newId)
		fs.writeFileSync("worlds/"+newId+"/metadata.json", JSON.stringify(metadata));
		allWorldsCache[newId] = metadata;
		fs.writeFileSync("worlds/"+newId+"/source.json", source);
		let usr = userMetadata(userId)
		usr["_SERVER_worlds"].push(newId);
		fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
		if (req.files["screenshot_image"]) {
			fs.copyFileSync(req.files["screenshot_image"][0].path, "images/"+newId+".png");
		}
		console.log("World \"" + metadata.title + "\" created!");

		let date = new Date();
		let line = date.toLocaleDateString("en-US");
		let csv = fs.readFileSync("total_worlds.csv").toString();
		let lines = csv.split("\n");
		let lastLine = lines[lines.length-1].split(",");
		const totalWorlds = fs.readdirSync("worlds").length;
		if (lastLine[0] == line) {
			lines[lines.length-1] = line + "," + totalWorlds;
			fs.writeFileSync("total_worlds.csv", lines.join("\n"));
		} else {
			fs.appendFileSync("total_worlds.csv", "\n" + line + "," + totalWorlds);
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
		let metadata = fullWorldSync(id, true)
		let owning = false;
		if (metadata["author_id"] == userId) {
			owning = true;
		} else if (metadata["author_account_type"] == "group") {
			let groupMeta = userMetadata(metadata["author_id"])
			for (k in groupMeta["members"]) {
				if (groupMeta["members"][k] == userId) {
					owning = true;
					break;
				}
			}
		}
		if (owning) {
			if (req.body["source_json_str"]) {
				fs.writeFileSync("worlds/"+id+"/source.tmp.json", req.body["source_json_str"]);
				fs.copyFileSync("worlds/"+id+"/source.tmp.json", "worlds/"+id+"/source.json");
				fs.unlinkSync("worlds/"+id+"/source.tmp.json");
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
			if (req.body["required_mods_json_str"]) {
				let v = req.body["required_mods_json_str"]
				if (typeof(v) === "object") {
					v = v[0]
				}
				metadata["required_mods"] = JSON.parse(v);
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
					"timestamp": dateString(),
					"world_id": parseInt(id),
					"world_image_urls_for_sizes": metadata["image_urls_for_sizes"],
					"world_title": metadata["title"]
				}
				addFeed(userId, feed);
			}
			metadata["updated_at"] = dateString();
			let metaStr = JSON.stringify(metadata);
			allWorldsCache[id] = metadata;
			fs.writeFileSync("worlds/"+id+"/metadata.json", metaStr);
			res.status(200).json({
				"world": fullWorldSync(id)
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

let worldListCache = {};
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
	let cacheIndex = page + kind + categoryId + search;
	if (req.params && req.params.user) {
		cacheIndex += req.params.user;
	}
	if (worldListCache[cacheIndex]) {
		let json = worldListCache[cacheIndex];
		if (json["expires"] <= Date.now()) {
			worldListCache[cacheIndex] = undefined;
		} else {
			res.status(200).json(json);
			return;
		}
	}

	worldCache(function(err, worlds) {
		worlds = Object.values(worlds);
		if (kind == "arcade") { // Hall of Fame
			worlds = worlds.map(function (world) {
				let rate = world["average_star_rating"];
				if (rate == 0) {
					rate = 1;
				}
				return {
					world: world,
					time: parseInt(world["play_count"]) * (rate-1)
				}
			});
		} else if (kind == "most_popular") { // Popular
			worlds = worlds.map(function (world) {
				let rate = world["average_star_rating"];
				if (rate == 0 || typeof rate != "number") {
					rate = 1; // unrated worlds can't appear on Popular
				}
				let date = new Date(world["first_published_at"]);
				if (world["first_published_at"] == undefined || isNaN(date.getTime())) {
					date = fs.statSync("worlds/" + world.id + "/metadata.json").birthtimeMs;
				} else {
					date = date.getTime();
				}
				return {
					world: world,
					time: date + (parseInt(world["play_count"]) * 10000000 * (rate-1))
				}
			});
		} else if (kind == "featured") { // Should be only 1 world, the world shown in big at top.
			worlds = worlds.map(function (world) {
				return {
					world: world,
					time: (world.id == featuredWorldId) ? 1 : 0
				}
			});
		} else { // "recent" and "unmoderated"
			worlds = worlds.map(function (world) {
				let date = new Date(world["first_published_at"]);
				if (world["first_published_at"] == undefined || isNaN(date.getTime())) {
					date = fs.statSync("worlds/" + world.id + "/metadata.json").birthtimeMs;
				} else {
					date = date.getTime();
				}
				return {
					world: world,
					time: date
				}
			});
		}
		worlds = worlds.sort(function (a, b) {
			return b.time - a.time;
		}).map(function(v) {
			return v.world;
		});
		let json = {};
		let obj = [];
		let publishedWorlds = [];

		let searchType = "none";
		let searchArgument = null;
		if (search) {
			search = search.toString().toLowerCase();
			if (search.startsWith("id:")) {
				searchType = "id";
				searchArgument = search.split(":")[1];
			} else if (search.startsWith("madebyid:")) {
				searchType = "madebyid";
				searchArgument = search.split(":")[1];
			} else if (search.startsWith("madeby:")) {
				searchType = "madeby";
				searchArgument = search.split(":")[1];
			} else {
				searchType = "title";
			}
		}
		
		for (i in worlds) {
			try {
			let world = worlds[i];
			if (world.id < 0) { // status update world
				continue;
			}
			let metadata = world;
			try {
				//metadata = processUserWorld(world);
			} catch (e) {
				console.error("Error parsing metadata:");
				console.error(e);
				metadata = null;
			}
			let cond = (metadata["publication_status"] == 1);
			if (req.params) {
				if (req.params.user) {
					cond = cond && (metadata["author_id"] == req.params.user);
				}
			}
			if (search) {
				if (cond === true) {
					if (searchType === "id") {
						cond = (metadata["id"].toString() == searchArgument);
					} else if (searchType === "madebyid") {
						cond = (metadata["author_id"].toString() == searchArgument);
					} else if (searchType === "madeby") {
						cond = (metadata["author_username"].search(searchArguments) != -1);
					} else {
						cond = (metadata["title"].toLowerCase().search(search) != -1);
					}
				}
			}
			if (cond) {
				if (categoryId !== undefined && metadata["category_ids"].indexOf(parseInt(categoryId)) == -1) {
					continue;
				}
				metadata["has_win_condition"] = undefined;
				//metadata["required_mods"] = undefined;
				metadata["number_of_raters"] = undefined;
				publishedWorlds.push(metadata);
				if (kind == "featured") {
					break;
				}
			}
			} catch (e) {
				console.error("Error sorting world " + worlds[i].id);
				console.error(e);
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
		worldListCache[cacheIndex] = json;
		worldListCache[cacheIndex]["expires"] = Date.now() + 1000*3600; // 1 hour
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

function worldLeaderboard(req, res) {
	let id = req.params.id;
	fullWorld(id, false, function(err, world) {
		if (err) {
			console.error(err);
			return;
		}
		let lb = world.leaderboard;
		if (!lb) {
			lb = {
				"leaderboard_type": 0,
				"records": [], // all time
				"periodic_records": [] // weekly
			};
			world.leaderboard = lb;
			fs.writeFile("worlds/" + id + "/metadata.json", JSON.stringify(world), function(err) {
				if (err) {
					throw err;
				}
			});
		}

		let meta = userMetadata(world["author_id"]);
		let periodicRecords = [];
		lb["author_id"] = world["author_id"];
		lb["author_play_count"] = world["play_count"];
		lb["author_username"] = meta["username"];
		lb["author_status"] = meta["user_status"];
		lb["records"].sort(function (a, b) {
			return a["best_time_ms"] - b["best_time_ms"];
		});
		for (k in lb["records"]) {
			let record = lb["records"][k];
			if (record["user_id"] == lb["author_id"]) {
				lb["author_best_time_ms"] = record["best_time_ms"];
			}
			let umeta = userMetadata(record["user_id"]);
			record["user_username"] = umeta["username"];
			record["user_profile_image_url"] = umeta["profile_image_url"];
			record["user_status"] = umeta["user_status"];
			record["rank"] = parseInt(k);
			let minDate = new Date();
			minDate.setDate(minDate.getDate() - 7);
			if (new Date(record["timestamp"]) > minDate) {
				periodicRecords.push(record);
			}
		}
		periodicRecords.sort(function (a, b) {
			return a["best_time_ms"] - b["best_time_ms"];
		});
		for (k in periodicRecords) {
			periodicRecords[k].rank = k;
		}
		lb["periodic_records"] = periodicRecords;
		res.status(200).json({
			"leaderboard": lb
		});
	});
}

function submitLeaderboardRecord(req, res) {
	let valid = validAuthToken(req, res, true);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	let id = req.params.id;
	fs.readFile("worlds/"+id+"/metadata.json", function(err, data) {
		if (err) {
			console.error(err);
			return;
		}
		let world = JSON.parse(data);
		let lb = world.leaderboard;
		if (!lb) {
			lb = {
				"leaderboard_type": 0,
				"records": [], // all time
				"periodic_records": [] // weekly
			};
			world.leaderboard = lb;
		}
		let improved = true;
		for (k in lb["records"]) {
			let record = lb["records"][k];
			if (record["user_id"] == userId) {
				if (parseInt(record["best_time_ms"]) < parseInt(req.body["time_ms"])) {
					improved = false;
				} else {
					lb["records"].splice(k, 1);
				}
				break;
			}
		}
		if (improved) {
			lb["records"].push({
				"user_id": userId,
				"best_time_ms": parseInt(req.body["time_ms"]), // TODO: check req.body["digest"]
				"timestamp": new Date().getTime(),
				"play_count": 1
			});
		}
		allWorldsCache[id] = world;
		fs.writeFile("worlds/" + id + "/metadata.json", JSON.stringify(world), function(err) {
			if (err) {
				throw err;
			}
		});
		res.status(200).json({
			"leaderboard": lb,
			"time_improved": improved
		});
	});
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
	featuredWorldId = fs.readFileSync("conf/featured_world.txt", {"encoding": "utf8"});

	app.delete("/api/v1/worlds/:id", deleteWorld);
	app.get("/api/v1/worlds/:id/basic_info", worldBasicInfo);
	app.get("/api/v1/worlds/:id", world);
	app.post("/api/v1/worlds", createWorld);
	app.put("/api/v1/worlds/:id", updateWorld);
	app.post("/api/v1/worlds/:id/plays", playWorld);
	app.get("/api/v1/worlds/:id/source_for_teleport", world);
	app.get("/api/v1/world_leaderboards/:id", worldLeaderboard);
	app.post("/api/v1/world_leaderboards/:id/plays", submitLeaderboardRecord);

	app.put("/api/v1/worlds/:id/published_status", express.urlencoded({"extended":false}), publicationStatus);
	app.get("/api/v1/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	});
	app.get("/api/v1/users/:user/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	})

	app.get("/api/v1/current_user/world_star_rating/:id", function(req, res) {
		let valid = validAuthToken(req, res, false);
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

		if (id === undefined) {
			res.status(400).json({
				"error": 400,
				"error_msg": "missing \"id\" POST data"
			});
		}
		if (stars === undefined) {
			res.status(400).json({
				"error": 400,
				"error_msg": "missing \"stars\" POST data"
			});
		}
		if (fs.existsSync("worlds/" + id)) {
			let ratings = JSON.parse(fs.readFileSync("users/" + userId + "/world_ratings.json"));
			let meta = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
			if (!meta["number_of_raters"]) {
				meta["number_of_raters"] = 0;
			}
			if (ratings.ratings[id]) {
				meta["average_star_rating"] = (meta["average_star_rating"] * meta["number_of_raters"] - ratings.ratings[id]) / (meta["number_of_raters"]-1);
				meta["number_of_raters"] -= 1;
			}
			if (meta["average_star_rating"] == 0) {
				meta["average_star_rating"] = stars;
			}
			meta["average_star_rating"] = (meta["average_star_rating"] * meta["number_of_raters"] + stars) / (meta["number_of_raters"]+1);
			meta["number_of_raters"] += 1;
			fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(meta));
			ratings.ratings[id] = stars;
			fs.writeFileSync("users/" + userId + "/world_ratings.json", JSON.stringify(ratings));
			const json = {
				"average_star_rating": fullWorldSync(id, true),
				"star_rating": stars,
			};
			res.status(200).json(json);
		} else {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such world"
			});
		}
	});
}