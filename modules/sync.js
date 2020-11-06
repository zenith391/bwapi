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

const express = require("express");
const https = require("https");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const zlib = require("zlib");
const qs = require("querystring");

var hosts = [
	{
		"address": "bwsecondary.ddns.net",
		"base": "https://bwsecondary.ddns.net:8080",
		"secure": true,
		"port": 8080
	},
	{
		"address": "bwsecondaryna.ddns.net",
		"base": "https://bwsecondaryna.ddns.net:8080",
		"secure": true,
		"port": 8080
	},
];

function sendData(targetHost, data) {
	// TODO: wson
	data.source = zlib.deflateRawSync(data.source, {"level": 9});

	const postData = qs.stringify(data);

	const req = https.request({
		"hostname": targetHost.address,
		"port": targetHost.port,
		"path": "/api/v2/sync/recv_data",
		"method": "POST",
		"headers": {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": Buffer.byteLength(postData)
		}
	}, function(res) {});

	console.log("Sent " + data.type + " " + data.id);
	req.on("error", function(e) {
		console.error(e);
	});
	req.write(postData);
	req.end();
}

function recvDataEndpoint(req, res) {
	const decompressedSource = zlib.inflateRawSync(req.data.source, {"level":9});
	console.log("Received " + req.data.type + " " + req.data.id);
	if (req.data.type == "world") {
		fs.writeFileSync("worlds/" + worldId + "/metadata.json", req.data.metadata);
		fs.writeFileSync("worlds/" + worldId + "/source.json", decompressedSource);
		fs.writeFileSync("images/" + worldId + ".png", req.data.image);
	} else if (req.data.type == "model") {
		fs.writeFileSync("models/" + worldId + "/metadata.json", req.data.metadata);
		fs.writeFileSync("models/" + worldId + "/source.json", decompressedSource);
		fs.writeFileSync("images/models/" + worldId + ".png", req.data.image);
		fs.writeFileSync("images/models/" + worldId + "_icon.png", req.data.iconImage);
	}
}

function requestEndpoint(req, res) {
	for (worldId in req.body.worlds) {
		fs.readFile("worlds/" + worldId + "/metadata.json", function(err, meta) {
			fs.readFile("worlds/" + worldId + "/source.json", function(err, source) {
				fs.readFile("images/" + worldId + ".png", function(err, image) {
					if (err) image = false;
					sendData({
						"id": worldId,
						"type": "world",
						"metadata": meta,
						"source": source,
						"image": image,
						"imageIcon": null
					});
				});
			});
		});
	}

	for (modelId in req.body.models) {
		fs.readFile("models/" + modelId + "/metadata.json", function(err, meta) {
			fs.readFile("models/" + modelId + "/source.json", function(err, source) {
				fs.readFile("images/" + modelId + ".png", function(err, image) {
					fs.readFile("images/" + modelId + ".png", function(err, icon) {
						sendData({
							"id": modelId,
							"type": "model",
							"metadata": meta,
							"source": source,
							"image": image,
							"imageIcon": icon
						});
					});
				});
			});
		});
	}
}

function startEndpoint(req, res) {
	fs.readdir("worlds", function(err, worlds) {
		let obj = {}

		let worldsList = [];
		for (world of worlds) {
			worldsList.push({
				"id": parseInt(world),
				"timestamp": fs.statSync("worlds/" + world + "/metadata.json").mtimeMs
			});
		}
		obj.worlds = worldsList;

		fs.readdir("models", function(err, models) {
			let modelsList = [];
			for (model of models) {
				modelsList.push({
					"id": parseInt(model),
					"timestamp": fs.statSync("models/" + model + "/metadata.json").mtimeMs
				});
			}
			obj.models = modelsList;

			fs.readdir("users", function(err, users) {
				let usersList = [];
				let userFiles = [
					"followed_users.json",
					"followers.json",
					"friends.json",
					"liked_worlds.json",
					"metadata.json",
					"model_ratings.json",
					"world_ratings.json",
					"news_feed.json",
					"pending_payouts.json",
					"played_worlds.json",
					"purchased_u2u_models.json",
					"profile_world/metadata.json",
				];
				for (file of users) {
					if (!isNaN(parseInt(file))) {
						let timestamp = 0;
						for (f of userFiles) {
							if (fs.existsSync("users/"+file+"/"+f))
								timestamp = Math.max(timestamp, fs.statSync("users/" + file + "/" + f).mtimeMs);
						}
						usersList.push({
							"id": parseInt(file),
							"timestamp": timestamp
						});
					}
				}
				obj.users = usersList;
				res.status(200).json(obj);
			});
		});
	});
}

module.exports.run = function(app) {
	app.get("/api/sync/v1/start", startEndpoint);
	app.post("/api/sync/v1/request", requestEndpoint);
	app.post("/api/v2/sync/recv_data", recvDataEndpoint)
}; 
