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

import fs from "fs";
import url from "url";
import { User } from "./users.js";
import { urlencoded } from "express";

const profanityRegex = /nigga|fuck|penis|dick|semen|cum/;

// Utility Functions //

// Retrieve author (author_username, etc.) data and store it in metadata.
global.processUserWorld = async function(meta) {
	if (meta["author_id"] == 0) {
		meta["author_username"] = "Corrupted";
		meta["author_profile_image_url"] = "corrupted";
		meta["author_status"] = 0;
		meta["author_blocksworld_premium"] = false;
		meta["author_account_type"] = "user"
	} else {
		let user = new User(parseInt(meta["author_id"]));
		meta["author_username"] = await user.getUsername();
		meta["author_profile_image_url"] = await user.getProfileImageURL();
		meta["author_status"] = await user.getStatus();
		//meta["author_blocksworld_premium"] = (user["blocksworld_premium"] != 0);
		meta["author_blocksworld_premium"] = false; // nobody has Premium here, since nobody pays
		meta["author_account_type"] = await user.getAccountType();
	}
	return meta;
}

// Asynchronous function to load a world.
// Parameters:
//   id: string      The ID of the world to load
//   source: bool    Whether to also load world source (alongside metadata) in 'source_json_str'
//   callback: func  The callback to call once the world is loaded
global.fullWorld = function(id, source, callback) {
	if (!fs.existsSync("worlds/" + id)) {
		callback(new Error("World not found."));
		return;
	}
	fs.readFile("worlds/" + id + "/metadata.json", async function(err, data) {
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

// Synchronous (and deprecated) version of the fullWorld(...) function
global.fullWorldSync = async function(id, noSource) {
	let world = {
		id: id.toString()
	}
	if (!fs.existsSync("worlds/" + id)) {
		return null;
	}
	let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
	for (const key in metadata) {
		world[key] = metadata[key];
	}
	if (!world["required_mods"]) world["required_mods"] = [];
	if (noSource === undefined || noSource == null) {
		world["source_json_str"] = fs.readFileSync("worlds/"+id+"/source.json",{"encoding":"utf8"});
	}
	world = await processUserWorld(world);
	return world;
}

let allWorldsCache = {};
let allWorldsCacheValid = false;
let allWorldsCacheLoading = false;

global.worldCacheSet = function(id, world) {
	world.id = id;
	if (!world.required_mods) world.required_mods = [];
	allWorldsCache[id] = world;
}

// Request the world cache. Calls 'callback' function with a list of all loaded worlds.
global.worldCache = function(callback) {
	if (!allWorldsCacheValid) {
		if (allWorldsCacheLoading) {
			console.log("Tried loading world cache at the same time!");
		}
		allWorldsCacheLoading = true;
		console.debug("Populating world cache..");
		fs.readdir("worlds", async function(err, files) {
			if (err) callback(err, null);

			for (const i in files) {
				let file = files[i];
				try {
					let json = JSON.parse(fs.readFileSync("worlds/"+file+"/metadata.json"));
					json["id"] = parseInt(file);
					if (!json["required_mods"]) json["required_mods"] = [];
					try {
						json = await processUserWorld(json);
					} catch (e) {
						console.error("Error parsing metadata", e);
					}
					allWorldsCache[json["id"]] = json;
				} catch (e) {
					// try to recover world
					// console.error("Had to recover world " + file + "!");
					console.warn("Should recover world " + file + " !");
					// let currDateStr = dateString();
					// fs.writeFileSync("worlds/"+file+"/metadata.json", JSON.stringify({
					// 	"title": "",
					// 	"average_star_rating": 0,
					// 	"description": "",
					// 	"has_win_condition": false,
					// 	"category_ids": [],
					// 	"author_id": 0, // TODO
					// 	"app_version": "1.47.0",
					// 	"publication_status": 5,
					// 	"likes_count": 0,
					// 	"play_count": 0,
					// 	"pay_to_play_cost": 0,
					// 	"image_urls_for_sizes": {
					// 		"440x440": HOST + "/images/"+file+".png",
					// 		"512x384": HOST + "/images/"+file+".png",
					// 		"220x220": HOST + "/images/"+file+".png",
					// 		"1024x768": HOST + "/images/"+file+".png"
					// 	},
					// 	"created_at": currDateStr,
					// 	"first_published_at": currDateStr,
					// 	"updated_at": currDateStr
					// }))
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

global.isWorldCacheValid = function() {
	return allWorldsCacheValid;
}

global.invalidateWorldCache = function() {
	allWorldsCache = {};
	allWorldsCacheValid = false;
	worldListCache = {};
}

// Module code //

// Endpoint for GET /api/v1/worlds/:id
function world(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		fullWorld(id, true, async function(err, world) {
			if (err) {
				throw err;
			}
			if (world.publication_status != 1 && false) {
				// This shouldn't be executed as it's necessary to retrieve private worlds
				res.status(403).json({
					"error": 403,
					"error_msg": "The world is private!"
				});
				return;
			}
			world["number_of_raters"] = undefined;
			res.status(200).json({
				"world": await processUserWorld(world)
			})
		});
	} else {
		res.status(404).json({
			"error": 404,
			"error_msg": "Not Found"
		});
	}
}

// Endpoint for GET /api/v1/worlds/:id/source_for_teleport
function worldTeleportSource(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		fullWorld(id, true, async function(err, world) {
			if (err) {
				throw err;
			}
			world["number_of_raters"] = undefined;
			res.status(200).json({
				"world": await processUserWorld(world)
			})
		});
	} else {
		res.status(404).json({
			"error": 404,
			"error_msg": "Not Found"
		});
	}
}

// Endpoint for GET /api/v1/worlds/:id/basic_info
function worldBasicInfo(req, res) {
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		fullWorld(id, false, async function(err, world) {
			if (err) {
				throw err;
			}
			res.status(200).json(await processUserWorld(world));
		});
	} else {
		res.status(404).json({
			"error": 404,
			"error_msg": "Not Found"
		});
	}
}

// Endpoint for DELETE /api/v1/worlds/:id
async function deleteWorld(req, res) {
	const valid = validAuthToken(req, res);
	if (valid.ok === false) return;
	const userId = valid.user.id;
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
			let meta = await valid.user.getMetadata();
			for (const i in meta["_SERVER_worlds"]) {
				if (meta["_SERVER_worlds"][i] == id) {
					meta["_SERVER_worlds"].splice(i, 1);
				}
			}
			await valid.user.setMetadata(meta);
			if (allWorldsCacheValid) {
				delete allWorldsCache[id];
			}
			res.status(200).json({
				"success": true
			});
		}
	} else {
		res.status(404).json({
			"error": 404,
			"error_message": "World is already deleted"
		})
	}
}

// Endpoint for PUT /api/v1/worlds/:id/publication_status
async function publicationStatus(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;
	let id = req.params.id
	if (fs.existsSync("worlds/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json", {"encoding": "utf8"}));
		if (metadata["author_id"] == userId) {
			if (req.body.is_published == "true") {
				if (profanityRegex.test(metadata.title) || profanityRegex.test(metadata.description)) {
					res.status(400).json({
						"error": 400,
						"error_message": "profanity_filter_error"
					});
				} else if (await valid.user.isBanned()) {
					res.status(400).json({
						"error": 400,
						"error_message": "You are banned."
					});
				} else {
					metadata["publication_status"] = 1;
					if (metadata["first_published_at"] == metadata["created_at"]) {
						metadata["first_published_at"] = dateString();
						await valid.user.addFeed({
							"type": 201,
							"timestamp": metadata["first_published_at"],
							"world_id": parseInt(id),
							"world_image_urls_for_sizes": metadata["image_urls_for_sizes"],
							"world_title": metadata["title"]
						});
					}
				}
			} else {
				metadata["publication_status"] = 5;
			}
			allWorldsCache[id] = metadata;
			fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(metadata));
			res.status(200).json(await fullWorldSync(id));
		} else {
			res.status(400).json({
				"error": "not owner"
			})
		}
	}
}

// Endpoint for POST /api/v1/worlds/:id/likes
function likeStatus(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;

	const id = parseInt(req.params.id);
	if (isNaN(id)) {
		res.status(400).json({
			"error": 400,
			"error_msg": "id is not a number"
		});
		return;
	}

	const likedWorlds = JSON.parse(fs.readFileSync("users/"+userId+"/liked_worlds.json"), {"encoding":"utf8"});
	if (fs.existsSync("worlds/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json", {"encoding": "utf8"}));
		let hasLiked = false;
		for (const world of likedWorlds.worlds) {
			if (world == id) {
				hasLiked = true;
			}
		}

		if (req.body.action == "add_like") {
			if (!hasLiked) {
				metadata["likes_count"] += 1;
				likedWorlds.worlds.push(parseInt(id));
			} else {
				res.status(403).json({
					"error": 403,
					"error_msg": "World already liked."
				});
				return;
			}
		} else if (req.body.action == "remove_like") {
			if (hasLiked) {
				metadata["likes_count"] -= 1;
				const index = likedWorlds.worlds.indexOf(parseInt(id));
				if (index !== -1) {
					likedWorlds.worlds.splice(index, 1);
				}
			} else {
				res.status(403).json({
					"error": 403,
					"error_msg": "World not liked."
				});
				return;
			}
		} else {
			res.status(400).json({
				"error": 400,
				"error_msg": "Invalid 'action' field"
			});
			return;
		}

		fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(metadata));
		fs.writeFileSync("users/"+userId+"/liked_worlds.json", JSON.stringify(likedWorlds));
		res.status(200).json({});
	}
}

// Endpoint for POST /api/v1/worlds
async function createWorld(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;
	let user = await (new User(userId)).getMetadata()
	if (user["_SERVER_worlds"].length > MAX_WORLD_LIMIT) {
		console.log(user["username"] + " has too many worlds.");
		res.status(400).json({
			"error": 400,
			"error_message": "Too many worlds created."
		});
		return;
	}

	fs.readFile("conf/new_world_id.txt", {"encoding": "utf8"}, async function(err, data) {
		if (err != null)
			console.log(err);
		let newId = data;
		fs.writeFileSync("conf/new_world_id.txt", (parseInt(newId)+1).toString());
		let currDateStr = dateString();
		let requiredMods = value(req.body, "required_mods_json_str");
		if (!requiredMods) {
			requiredMods = [];
		} else {
			requiredMods = JSON.parse(requiredMods);
		}
		let categoryIdsJsonStr = value(req.body, "category_ids_json_str");
		if (categoryIdsJsonStr === undefined) categoryIdsJsonStr = "[]";
		let metadata = {
			"title": value(req.body, "title"),
			"description": value(req.body, "description"),
			"has_win_condition": value(req.body, "has_win_condition") == "true",
			"category_ids": JSON.parse(categoryIdsJsonStr),
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
		let usr = new User(userId);
		await usr.appendOwnedWorld(newId);
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
			"world": await fullWorldSync(newId)
		});
	});
}

// Endpoint for PUT /api/v1/worlds/:id
async function updateWorld(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		let metadata = await fullWorldSync(id, true)
		let owning = false;
		if (metadata["author_id"] == userId) {
			owning = true;
		} else if (metadata["author_account_type"] == "group") {
			// let groupMeta = userMetadata(metadata["author_id"])
			// for (const k in groupMeta["members"]) {
			// 	if (groupMeta["members"][k] == userId) {
			// 		owning = true;
			// 		break;
			// 	}
			// }
			return;
		}
		if (owning) {
			if (req.body["source_json_str"]) {
				fs.writeFileSync("worlds/"+id+"/source.tmp.json", value(req.body, "source_json_str"));
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
				if (profanityRegex.test(metadata.title) || profanityRegex.test(metadata.description)) {
					res.status(400).json({
						"error": 400,
						"error_message": "profanity_filter_error"
					});
					return;
				}

				let feed = {
					"type": 202,
					"timestamp": dateString(),
					"world_id": parseInt(id),
					"world_image_urls_for_sizes": metadata["image_urls_for_sizes"],
					"world_title": metadata["title"]
				}
				await valid.user.addFeed(feed);
			}
			metadata["updated_at"] = dateString();
			let metaStr = JSON.stringify(metadata);
			allWorldsCache[id] = metadata;
			fs.writeFileSync("worlds/"+id+"/metadata.json", metaStr);
			res.status(200).json({
				"world": await fullWorldSync(id)
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
// Endpoint for GET /api/v1/worlds
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
		if (Date.now() >= json["expires"]) {
			worldListCache[cacheIndex] = undefined;
		} else {
			let copy = Object.assign({}, json);
			delete copy.expires;
			res.status(200).json(copy);
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
					//date = fs.statSync("worlds/" + world.id + "/metadata.json").birthtimeMs;
					date = 0;
				} else {
					date = date.getTime();
				}
				return {
					world: world,
					time: date + ((parseInt(world["play_count"]) + parseInt(world["likes_count"])*10) * 10000000 * (rate-1))
				}
			});
		} else if (kind == "featured") { // Should be only 1 world, the world shown in big at top.
			const featuredWorldTxt = fs.readFileSync("conf/featured_world_id.txt", { encoding: "utf8" });
			const featuredWorldId  = parseInt(featuredWorldTxt);

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
		
		for (let world of worlds) {
			try {
				let metadata = world;
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
							cond = (metadata["author_username"].toLowerCase().search(searchArgument) != -1);
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
				console.error("Error sorting world " + world.id);
				console.error(e);
			}
		}
		let start = Math.min(publishedWorlds.length, 24*page);
		let end = Math.min(publishedWorlds.length, start+24);
		for (let i=start; i < end; i++) {
			obj.push(publishedWorlds[i]);
		}
		json["worlds"] = obj;
		if (end < publishedWorlds.length) {
			json["pagination_next_page"] = page + 2;
		} else {
			json["pagination_next_page"] = null;
		}
		worldListCache[cacheIndex] = Object.assign({}, json);
		worldListCache[cacheIndex]["expires"] = Date.now() + 1000*3600; // 1 hour

		res.status(200).json(json);
	});
}

// Endpoint for POST /api/v1/worlds/:id/plays
function playWorld(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;
	let id = req.params["id"];
	if (fs.existsSync("worlds/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
		let playedWorlds = JSON.parse(fs.readFileSync("users/"+userId+"/played_worlds.json"))
		if (playedWorlds["worlds"].indexOf(parseInt(id)) == -1) {
			metadata["play_count"] += 1;
			let metaStr = JSON.stringify(metadata);
			fs.writeFileSync("worlds/"+id+"/metadata.json", metaStr);
			playedWorlds["worlds"].push(parseInt(id))
			let playStr = JSON.stringify(playedWorlds)
			fs.writeFile("users/"+userId+"/played_worlds.json", playStr, function(err) {
				if (err != null)
					console.log("file error for world update: " + err);
			});
		}
		res.status(200).json({ ok: true });
	} else {
		res.status(404).json({ error: "404", error_msg: "world does not exists" })
	}
}

// Endpoint for GET /api/v1/world_leaderboards/:id
async function worldLeaderboard(req, res) {
	let id = req.params.id;
	fullWorld(id, false, async function(err, world) {
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

		const author = new User(world.author_id);
		let periodicRecords = [];
		lb["author_id"] = world["author_id"];
		lb["author_play_count"] = world["play_count"];
		lb["author_username"] = await author.getUsername();
		lb["author_status"] = await author.getStatus();
		lb["records"].sort(function (a, b) {
			return a["best_time_ms"] - b["best_time_ms"];
		});

		for (const k in lb["records"]) {
			let record = lb["records"][k];
			if (record["user_id"] == lb["author_id"]) {
				lb["author_best_time_ms"] = record["best_time_ms"];
			}
			const user = new User(record.user_id);
			record["user_username"] = await user.getUsername();
			record["user_profile_image_url"] = await user.getProfileImageURL();
			record["user_status"] = await user.getStatus();
			record["rank"] = parseInt(k);
			let minDate = new Date();
			minDate.setDate(minDate.getDate() - 7);
			if (new Date(record["timestamp"]) > minDate) {
				periodicRecords.push(Object.assign({}, record));
			}
		}

		periodicRecords.sort(function (a, b) {
			return a["best_time_ms"] - b["best_time_ms"];
		});
		for (const k in periodicRecords) {
			periodicRecords[k].rank = parseInt(k);
		}
		lb["periodic_records"] = periodicRecords;
		res.status(200).json({
			"leaderboard": lb
		});
	});
}

// Endpoint for POST /api/v1/world_leaderboards/:id/plays
function submitLeaderboardRecord(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const userId = valid.user.id;
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
		for (const k in lb["records"]) {
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

export function run(app) {
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
	app.get("/api/v1/worlds/:id/source_for_teleport", worldTeleportSource);
	app.get("/api/v1/world_leaderboards/:id", worldLeaderboard);
	app.post("/api/v1/world_leaderboards/:id/plays", submitLeaderboardRecord);

	app.put("/api/v1/worlds/:id/published_status", urlencoded({ extended: false }), publicationStatus);
	app.get("/api/v1/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	});
	app.get("/api/v1/users/:user/worlds", function(req, res) {
		worldsGet(req, res, url.parse(req.url, true));
	});

	app.post("/api/v1/worlds/:id/likes", likeStatus);

	app.get("/api/v1/current_user/world_star_rating/:id", async function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;
		let userId = valid.user.id;
		let id = req.params.id;
		if (fs.existsSync("worlds/" + id)) {
			let ratings = JSON.parse(fs.readFileSync("users/" + userId + "/world_ratings.json"));
			let json = {
				"average_star_rating": (await fullWorldSync(id, true))["average_star_rating"]
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
		if (valid.ok === false) return;
		let userId = valid.user.id;
		let id = parseInt(req.params.id);
		let stars = parseInt(req.body.stars);

		if (id === undefined) {
			res.status(400).json({
				"error": 400,
				"error_msg": "missing \"id\" POST data"
			});
		}
		if (stars === undefined || stars === null) {
			res.status(400).json({
				"error": 400,
				"error_msg": "missing \"stars\" POST data"
			});
		}
		if (fs.existsSync("worlds/" + id)) {
			let ratings = JSON.parse(fs.readFileSync("users/" + userId + "/world_ratings.json"));
			let meta = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json"));
			if (meta["number_of_raters"] === undefined) {
				meta["number_of_raters"] = 1;
			}
			if (ratings.ratings[id]) {
				meta["average_star_rating"] = (meta["average_star_rating"] * meta["number_of_raters"] - ratings.ratings[id]) / (meta["number_of_raters"]-1);
				meta["number_of_raters"] -= 1;
			}
			if (meta["average_star_rating"] == 0 || !isFinite(meta["average_star_rating"])) {
				meta["average_star_rating"] = stars;
			} else {
				meta["average_star_rating"] = (meta["average_star_rating"] * meta["number_of_raters"] + stars) / (meta["number_of_raters"]+1);
			}
			meta["number_of_raters"] += 1;
			fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(meta));
			ratings.ratings[id] = stars;
			fs.writeFileSync("users/" + userId + "/world_ratings.json", JSON.stringify(ratings));
			res.status(200).json({
				"average_star_rating": meta["average_star_rating"],
				"star_rating": stars,
			});
		} else {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such world"
			});
		}
	});
}