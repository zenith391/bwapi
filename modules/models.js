const fs = require("fs");
const url = require("url");

fullModelSync = function(id, noSource) {
	let model = {
		id: id.toString()
	}
	let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
	for (key in metadata) {
		model[key] = metadata[key];
	}
	if (noSource == undefined || noSource == null) {
		model["source_json_str"] = fs.readFileSync("models/"+id+"/source.json",{"encoding":"utf8"});
	}
	model = processUserWorld(model);
	return model;
}

function createModel(req, res) {
	let valid = validAuthToken(req, res, true);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];

	fs.readFile("conf/new_model_id.txt", {"encoding": "utf8"}, function(err, data) {
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
			"author_id": parseInt(userId),
			"publication_status": 0, // not published
			"sales_count": 0,
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
		let source = req.body["source_json_str"];
		fs.mkdirSync("models/"+newId)
		fs.writeFileSync("models/"+newId+"/metadata.json", JSON.stringify(metadata));
		fs.writeFileSync("models/"+newId+"/source.json", source);
		let usr = userMetadata(userId);
		if (usr["_SERVER_models"] == undefined) // old user format
			usr["_SERVER_models"] = [];
		usr["_SERVER_models"].push(newId);
		fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
		if (req.files["iconSD"] && req.files["imageSD"]) {
			fs.copyFileSync(req.files["imageSD"][0].path, "images/models/"+newId+".png");
			fs.copyFileSync(req.files["iconSD"][0].path, "images/models/"+newId+"_icon.png");
		}
		res.status(200).json({
			"user_model": fullModelSync(newId)
		});
	});
}

function updateModel(req, res) {
	let valid = validAuthToken(req, res, true);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];

	let id = req.params["id"];
	if (fs.existsSync("models/" + id)) {
		let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
		if (metadata["author_id"] == userId) {
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
					let feed = {
						"type": 301,
						"timestamp": metadata["first_published_at"],
						"model_id": parseInt(id),
						"model_icon_urls_for_sizes": metadata["icon_urls_for_sizes"],
						"model_sales_count": metadata["sales_count"],
						"model_title": metadata["title"]
					}
					addFeed(userId, feed)
				}
			} else if (req.body["unpublish"] == "yes") {
				metadata["publication_status"] = 0; // unpublished
			}
			metadata["updated_at"] = dateString();

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
	fs.readdir("models", function(err, files) {
		if (kind == "best_sellers") {
			files = files.map(function (fileName) {
				let json = JSON.parse(fs.readFileSync("models/"+fileName+"/metadata.json"));
				let sales = parseInt(json["sales_count"]);
				if (sales == undefined) {
					sales = 0;
				}
				return {
					name: fileName,
					time: fs.statSync("models/"+fileName).birthtimeMs + sales * 290000000
				}
			});
		} else {
			files = files.map(function (fileName) {
				return {
					name: fileName,
					time: fs.statSync("models/"+fileName).birthtimeMs
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
		let publishedModels = [];
		for (i in files) {
			let model = {}
			let metadata = JSON.parse(fs.readFileSync("models/"+files[i]+"/metadata.json"));
			let cond = true;
			if (req.params) {
				if (req.params.user) {
					cond = metadata["author_id"] == req.params.user;
				}
			}
			if (metadata["publication_status"] == 2 && cond) {
				for (key in metadata) {
					model[key] = metadata[key];
				}
				if (categoryId != undefined && model["model_category_id"] != categoryId) {
					continue;
				}
				model = processUserWorld(model);
				publishedModels.push(model);
			}
		}
		let start = Math.min(publishedModels.length, 30*page);
		let end = Math.min(publishedModels.length, start+30);
		for (i=start; i < end; i++) {
			obj.push(publishedModels[i]);
		}
		json["u2u_models"] = obj;
		if (end < publishedModels.length) {
			json["pagination_next_page"] = page + 2; // + 2 because it got substracted by 1 before
		}
		res.status(200).json(json);
	});
} 

function purchaseModel(req, res) {
	let valid = validAuthToken(req, res);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	let id = req.body["u2u_model_id"];
	if (fs.existsSync("models/" + id)) {
		let model = fullModelSync(id, true);
		let price = model["coins_price_markup"];
		let meta2 = userMetadata(model["author_id"]);
		let meta = userMetadata(userId);
		if ((meta["coins"] - price) > 0) {
			meta["coins"] = meta["coins"] - price;
			meta2["coins"] = meta2["coins"] + price;
			if (!model["sales_count"]) {
				model["sales_count"] = 0;
			}
			model["sales_count"] = model["sales_count"] + 1;
			fs.writeFileSync("users/" + userId + "/metadata.json", JSON.stringify(meta));
			fs.writeFileSync("users/" + model["author_id"] + "/metadata.json", JSON.stringify(meta2));
			if (!fs.existsSync("users/" + userId + "/purchased_u2u_models.json")) {
				fs.writeFileSync("users/" + userId + "/purchased_u2u_models.json", "{\"u2u_models\":[]}");
			}
			let usr = JSON.parse(fs.readFileSync("users/" + userId + "/purchased_u2u_models.json"));
			usr["u2u_models"].push(parseInt(id));
			fs.writeFileSync("users/" + userId + "/purchased_u2u_models.json", JSON.stringify(usr));
			fs.writeFileSync("models/" + id + "/metadata.json", JSON.stringify(model));
			res.status(200).json({
				"attrs_for_current_user": meta
			});

			// notify model seller of the sale
			let feed = {
				"type": 302,
				"timestamp": dateString(),
				"model_id": parseInt(id),
				"model_icon_urls_for_sizes": model["icon_urls_for_sizes"],
				"model_sales_count": model["sales_count"],
				"model_title": model["title"]
			}
			addFeed(model["author_id"], feed)

			// notify model purchaser of the purchase
			feed = {
				"type": 304,
				"timestamp": dateString(),
				"model_id": parseInt(id),
				"model_icon_urls_for_sizes": model["icon_urls_for_sizes"],
				"model_title": model["title"]
			}
			addFeed(userId, feed);
		} else {
			res.status(200).json({
				"error": 400,
				"error_msg": "Not enough coins"
			});
		}
	}
}

module.exports.run = function(app) {
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
	app.get("/api/v1/u2u_models/:id", function(req, res) {
		let id = req.params["id"];
		if (fs.existsSync("models/" + id)) {
			res.status(200).json({
				"u2u_model": fullModelSync(id)
			})
		}
	});

	app.delete("/api/v1/user_models/:id", function(req, res) {
		let valid = validAuthToken(req, res);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let id = req.params.id
		if (fs.existsSync("models/" + id)) {
			let metadata = JSON.parse(fs.readFileSync("models/"+id+"/metadata.json"));
			if (metadata["author_id"] == userId) {
				fs.unlinkSync("models/"+id+"/metadata.json");
				fs.unlinkSync("models/"+id+"/source.json");
				try {
					fs.unlinkSync("images/models/"+id+".png");
					fs.unlinkSync("images/models/"+id+"_icon.png");
				} catch (e) {
					console.err("Failed to delete images/models/"+id+".png")
				}
				fs.rmdirSync("models/"+id);
				let usr = userMetadata(userId)
				for (i in usr["_SERVER_models"]) {
					if (usr["_SERVER_models"][i] == id) {
						usr["_SERVER_models"].splice(i, 1);
					}
				}
				fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(usr));
				res.status(200).json({});
			}
		}
	});

	app.post("/api/v1/u2u_models/purchases", purchaseModel);
	app.post("/api/v1/u2u_models/blueprints/purchases", purchaseModel);

	app.get("/api/v1/user_models", function(req, res) {
		let valid = validAuthToken(req, res);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let list = [];
		let usr = userMetadata(userId);
		if (usr["_SERVER_models"] != undefined) {
			for (i in usr["_SERVER_models"]) {
				list[i] = fullModelSync(usr["_SERVER_models"][i]);
			}
		}
		res.status(200).json({
			"user_models": list
		});
	});

	app.get("/api/v1/current_user/purchased_u2u_models", function(req, res) {
		let valid = validAuthToken(req, res);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let list = [];
		if (!fs.existsSync("users/" + userId + "/purchased_u2u_models.json")) {
			fs.writeFileSync("users/" + userId + "/purchased_u2u_models.json", "{\"u2u_models\":[]}");
		}
		let usr = JSON.parse(fs.readFileSync("users/" + userId + "/purchased_u2u_models.json"));
		for (i in usr["u2u_models"]) {
			list[i] = fullModelSync(usr["u2u_models"][i]);
		}
		res.status(200).json({
			"u2u_models": list
		});
	});

	app.post("/api/v1/user_models", createModel);
	app.put("/api/v1/user_models/:id", updateModel);
}