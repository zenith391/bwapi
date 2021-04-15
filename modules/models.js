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

global.fullModelSync = async function(id, noSource) {
	let model = {
		id: id.toString()
	}
	try {
		let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
		for (const key in metadata) {
			model[key] = metadata[key];
		}
		if (noSource == undefined || noSource == null) {
			model["source_json_str"] = fs.readFileSync("models/"+id+"/source.json",{"encoding":"utf8"});
		}
		model = await processUserWorld(model);
		return model;
	} catch (e) {
		console.error(e);
		return null;
	}
}

let allModelsCache = {};
let allModelsCacheValid = false;
let allModelsCacheLoading = false;
export function modelCache(callback) {
	if (!allModelsCacheValid) {
		if (allModelsCacheLoading) {
			console.log("Tried loading model cache at the same time!");
		}
		allModelsCacheLoading = true;
		console.debug("Populating model cache..");
		fs.readdir("models", async function(err, files) {
			if (err) callback(err, null);

			for (const i in files) {
				let file = files[i];
				try {
					let json = JSON.parse(fs.readFileSync("models/"+file+"/metadata.json"));
					json["id"] = parseInt(file);
					try {
						json = await processUserWorld(json);
					} catch (e) {
						console.error("Error parsing metadata:");
						console.error(e);
					}
					allModelsCache[json["id"]] = json;
				} catch (e) {
					console.error("Invalid model " + file + "!");
				}
			}
			console.debug(files.length + " models found.");
			allModelsCacheValid = true;
			allModelsCacheLoading = false;
			callback(null, allModelsCache);
		});
	} else {
		callback(null, allModelsCache);
	}
}

export function isModelCacheValid() {
	return allModelsCacheValid;
}

export function invalidateModelCache() {
	allModelsCache = {};
	allModelsCacheValid = false;
}

function createModel(req, res) {
	let valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const user = valid.user;

	fs.readFile("conf/new_model_id.txt", {"encoding": "utf8"}, async function(err, data) {
		if (err != null)
			console.log(err);
		let newId = data;
		fs.writeFile("conf/new_model_id.txt", (parseInt(newId)+1).toString(), function(err) {
			if (err != null)
				console.log(err);
		});
		let currDateStr = dateString();
		let metadata = {
			"id": newId,
			"u2u_model_id": newId,
			"title": value(req.body, "title"),
			"short_title": value(req.body, "short_title"),
			"description": value(req.body, "description"),
			"has_win_condition": value(req.body, "has_win_condition") == "true",
			"model_category_id": value(req.body, "model_category_id"),
			"author_id": user.id,
			"publication_status": 0, // not published
			"sales_count": 0,
			"popularity_count": 0,
			"image_urls_for_sizes": {
				"768x768": HOST + "/images/models/"+newId+".png"
			},
			"icon_urls_for_sizes": {
				"128x128": HOST + "/images/models/"+newId+"_icon.png"
			},
			"preview_terrain": value(req.body, "preview_terrain"),
			"source_locked": value(req.body, "source_locked") == "true",
			"coins_price": parseInt(value(req.body, "coins_price_markup")),
			"coins_price_markup": parseInt(value(req.body, "coins_price_markup")), // markup = user-set price
			"coins_price_blueprint": parseInt(value(req.body, "coins_price_markup")),
			"coins_price_blocks_inventory": 0,
			"blocksworld_premium_coins_price": parseInt(value(req.body, "coins_price_markup")),
			"blocksworld_premium_coins_price_blueprint": parseInt(value(req.body, "coins_price_markup")),
			"blocks_inventory_str": value(req.body, "blocks_inventory_str"),
			"source_equality_checksum": value(req.body, "source_equality_checksum"),
			"created_at": currDateStr,
			"updated_at": currDateStr
		};
		let source = value2(req.body["source_json_str"]);
		fs.mkdirSync("models/"+newId)
		fs.writeFileSync("models/"+newId+"/metadata.json", JSON.stringify(metadata));
		fs.writeFileSync("models/"+newId+"/source.json", source);
		await user.appendOwnedModel(newId);
		if (req.files["iconSD"] && req.files["imageSD"]) {
			fs.copyFileSync(req.files["imageSD"][0].path, "images/models/"+newId+".png");
			fs.copyFileSync(req.files["iconSD"][0].path, "images/models/"+newId+"_icon.png");
		}
		allModelsCache[newId] = metadata;

		let date = new Date();
		let line = date.toLocaleDateString("en-US");
		let csv = fs.readFileSync("total_models.csv").toString();
		let lines = csv.split("\n");
		let lastLine = lines[lines.length-1].split(",");
		const totalWorlds = fs.readdirSync("models").length;
		if (lastLine[0] == line) {
			lines[lines.length-1] = line + "," + totalWorlds;
			fs.writeFileSync("total_models.csv", lines.join("\n"));
		} else {
			fs.appendFileSync("total_models.csv", "\n" + line + "," + totalWorlds);
		}

		res.status(200).json({
			"user_model": await fullModelSync(newId)
		});
	});
}

async function updateModel(req, res) {
	let valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;
	const user = valid.user;

	let id = req.params["id"];
	if (fs.existsSync("models/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
		if (metadata["author_id"] == user.id) {
			if (req.body["title"]) {
				metadata["title"] = value(req.body, "title");
			}
			if (req.body["short_title"]) {
				metadata["short_title"] = value(req.body, "short_title");
			}
			if (req.body["description"]) {
				metadata["description"] = value(req.body, "description");
			}
			if (req.body["preview_terrain"]) {
				metadata["preview_terrain"] = value(req.body, "preview_terrain");
			}
			if (req.body["model_category_id"]) {
				metadata["model_category_id"] = value(req.body, "model_category_id");
			}
			if (req.body["blocks_inventory_str"]) {
				metadata["blocks_inventory_str"] = value(req.body, "blocks_inventory_str");
			}
			if (req.body["source_equality_checksum"]) {
				metadata["source_equality_checksum"] = value(req.body, "source_equality_checksum");
			}
			if (req.body["coins_price_markup"]) {
				metadata["coins_price"] = parseInt(value(req.body, "coins_price_markup"));
				metadata["coins_price_blueprint"] = parseInt(value(req.body, "coins_price_markup"));
				metadata["coins_price_markup"] = parseInt(value(req.body, "coins_price_markup"));
				metadata["blocksworld_premium_coins_price"] = parseInt(value(req.body, "coins_price_markup"));
				metadata["blocksworld_premium_coins_price_blueprint"] = parseInt(value(req.body, "coins_price_markup"));
			}
			if (req.body["source_locked"]) {
				metadata["source_locked"] = value(req.body, "source_locked") == "true";
			}
			if (!metadata["sales_count"]) {
				metadata["sales_count"] = 0;
			}
			if (req.body["publish"] == "yes") {
				metadata["publication_status"] = 2; // approved and published
				metadata["u2u_model_id"] = metadata["id"];
				if (!metadata["first_published_at"]) {
					metadata["first_published_at"] = dateString();
					await user.addFeed({
						"type": 301,
						"timestamp": metadata["first_published_at"],
						"model_id": parseInt(id),
						"model_icon_urls_for_sizes": metadata["icon_urls_for_sizes"],
						"model_sales_count": metadata["sales_count"],
						"model_title": metadata["title"]
					});
				}
			} else if (req.body["unpublish"] == "yes") {
				metadata["publication_status"] = 0; // unpublished
			}
			metadata["updated_at"] = dateString();
			allModelsCache[id] = metadata;

			let metaStr = JSON.stringify(metadata);
			fs.writeFile("models/"+id+"/metadata.json", metaStr, function(err) {
				if (err != null)
					console.log("file error for model update: " + err);
				res.status(200).json({
					"user_model": metadata
				});
			});
		} else {
			res.status(403).json({
				"error": "not owning the model"
			});
		}
	} else {
		res.status(404);
	}
}

function modelsGet(req, res) {
	let u = url.parse(req.url, true);
	let page = u.query.page;
	let categoryId = u.query.category_id;
	let kind = u.query.kind;
	if (kind == undefined) {
		kind = "recent";
	}
	if (page === undefined) {
		page=0;
	} else {
		page = Math.max(0,page-1);
	}
	modelCache(async function(err, models) {
		models = Object.values(models);
		if (kind == "best_sellers") {
			models = models.map(function (model) {
				let sales = parseInt(model["popularity_count"]);
				let date = fs.statSync("models/"+model.id+"/metadata.json").birthtimeMs;
				if (model["first_published_at"]) {
					date = new Date(model["first_published_at"]).getTime();
				}
				if (sales == undefined || isNaN(sales)) {
					sales = 0;
				}
				return {
					name: model,
					time: date + sales * 290000000
				}
			});
		} else {
			models = models.map(function (model) {
				let date = fs.statSync("models/"+model.id+"/metadata.json").birthtimeMs;
				if (model["first_published_at"]) {
					date = new Date(model["first_published_at"]).getTime();
				}
				return {
					name: model,
					time: date
				}
			});
		}
		models = models.sort(function (a, b) {
			return b.time - a.time;
		}).map(function(v) {
			return v.name;
		});
		let json = {};
		let obj = [];
		let publishedModels = [];
		for (const metadata of models) {
			let model = {}
			let cond = true;
			if (req.params) {
				if (req.params.user) {
					cond = metadata["author_id"] == req.params.user;
				}
			}
			if (metadata["publication_status"] == 2 && cond) {
				for (const key in metadata) {
					model[key] = metadata[key];
				}
				if (categoryId != undefined && model["model_category_id"] != categoryId) {
					continue;
				}
				model = await processUserWorld(model);
				publishedModels.push(model);
			}
		}
		let start = Math.min(publishedModels.length, 30*page);
		let end = Math.min(publishedModels.length, start+30);
		for (let i = start; i < end; i++) {
			obj.push(publishedModels[i]);
		}
		json["u2u_models"] = obj;
		if (end < publishedModels.length) {
			json["pagination_next_page"] = page + 2; // + 2 because it got substracted by 1 before
		}
		res.status(200).json(json);
	});
} 

async function purchaseModel(req, res) {
	let valid = validAuthToken(req, res);
	if (valid.ok === false) return;
	const user = valid.user;
	const userCoins = await user.getCoins();

	let id = req.body["u2u_model_id"];
	if (fs.existsSync("models/" + id)) {
		let model = await fullModelSync(id, true);
		const price = model["coins_price_markup"];
		const author = userMetadata(model["author_id"]);
		if ((userCoins - price) >= 0) {
			await user.setCoins(userCoins - price);
			await author.addPayout({
				"payout_type": "coins",
				"coin_grants": price,
				"title": "Sales!",
				"msg1": "Sold 1 copy of \"" + model["title"] + "\"!",
				"msg2": "",
				"has_gold_border": false
			})
			if (!model["sales_count"]) model["sales_count"] = 0;
			if (!model["popularity_count"]) model["popularity_count"] = model["sales_count"];
			model["sales_count"] = model["sales_count"] + 1;
			if (!fs.existsSync("users/" + user.id + "/purchased_u2u_models.json")) {
				fs.writeFileSync("users/" + user.id + "/purchased_u2u_models.json", "{\"u2u_models\":[]}");
			}
			let usr = JSON.parse(fs.readFileSync("users/" + user.id + "/purchased_u2u_models.json"));
			if (!usr["u2u_models"].includes(parseInt(id))) {
				usr["u2u_models"].push(parseInt(id));
				model["popularity_count"] = model["popularity_count"] + 1;
			}
			fs.writeFileSync("users/" + user.id + "/purchased_u2u_models.json", JSON.stringify(usr));
			fs.writeFileSync("models/" + id + "/metadata.json", JSON.stringify(model));
			res.status(200).json({
				"attrs_for_current_user": { "coins": coins - price }
			});

			// notify model seller of the sale
			await author.addFeed({
				"type": 302,
				"timestamp": dateString(),
				"model_id": parseInt(id),
				"model_icon_urls_for_sizes": model["icon_urls_for_sizes"],
				"model_sales_count": model["sales_count"],
				"model_title": model["title"]
			});

			// notify model purchaser of the purchase
			await user.addFeed({
				"type": 304,
				"timestamp": dateString(),
				"model_id": parseInt(id),
				"model_icon_urls_for_sizes": model["icon_urls_for_sizes"],
				"model_title": model["title"]
			});
		} else {
			res.status(400).json({
				"error": 400,
				"error_msg": "Not enough coins"
			});
		}
	}
}

export function run(app) {
	if (!fs.existsSync("models")) {
		fs.mkdirSync("models");
		console.log("Created folder \"models\"");
	}
	if (!fs.existsSync("conf/new_model_id.txt")) {
		fs.writeFileSync("conf/new_model_id.txt", "1")
		console.log("Created file \"conf/new_model_id.txt\"");
	}

	app.get("/api/v1/u2u_models", modelsGet);
	app.get("/api/v1/users/:user/u2u_models", modelsGet);
	app.get("/api/v1/u2u_models/:id", async function(req, res) {
		let id = req.params["id"];
		if (fs.existsSync("models/" + id)) {
			res.status(200).json({
				"u2u_model": await fullModelSync(id)
			})
		}
	});

	app.delete("/api/v1/user_models/:id", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;
		const user = valid.user;
		let id = req.params.id
		if (fs.existsSync("models/" + id)) {
			let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
			if (metadata["author_id"] == user.id) {
				fs.unlinkSync("models/"+id+"/metadata.json");
				fs.unlinkSync("models/"+id+"/source.json");
				try {
					fs.unlinkSync("images/models/"+id+".png");
					fs.unlinkSync("images/models/"+id+"_icon.png");
				} catch (e) {
					console.err("Failed to delete images/models/"+id+".png")
				}
				fs.rmdirSync("models/"+id);
				let usr = await user.getMetadata();
				for (i in usr["_SERVER_models"]) {
					if (usr["_SERVER_models"][i] == id) {
						usr["_SERVER_models"].splice(i, 1);
					}
				}
				await user.setMetadata(usr);
				delete allModelsCache[id];
				res.status(200).json({});
			}
		}
	});

	app.post("/api/v1/u2u_models/purchases", purchaseModel);
	app.post("/api/v1/u2u_models/blueprints/purchases", purchaseModel);

	app.get("/api/v1/user_models", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;
		const user = valid.user;
		let list = [];
		let userModels = await user.getOwnedModels();
		for (const id of userModels) {
			const val = await fullModelSync(id);
			if (val != null) {
				list.push(val);
			}
		}
		res.status(200).json({
			"user_models": list
		});
	});

	app.get("/api/v1/current_user/purchased_u2u_models", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;
		const user = valid.user;
		let list = [];
		let purchasedModels = await user.getPurchasedModels();
		for (const modelId of purchasedModels) {
			if (fs.existsSync("models/" + modelId + "/metadata.json")) {
				list.push(await fullModelSync(modelId));
			}
		}
		res.status(200).json({
			"u2u_models": list
		});
	});

	app.post("/api/v1/user_models", createModel);
	app.put("/api/v1/user_models/:id", updateModel);
}
