const express = require("express");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

var hosts = [
	{
		"address": "bwsecondary.ddns.net",
		"secure": true,
		"port": 8080
	},
];

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
	app.get("/api/sync/v1/request", startEndpoint);
}; 
