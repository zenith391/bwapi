import { expect } from "chai";
import request from "supertest";
import app from "../modules/app.js";
import fs from "fs";

describe("Login with Steam", () => {

	before("backup users directory", () => {
		fs.renameSync("users", "users_old");
		fs.mkdirSync("users", {});

		fs.renameSync("usersSteamLinks", "usersSteamLinks_old");
		fs.mkdirSync("usersSteamLinks", {});

		fs.copyFileSync("conf/new_account_id.txt", "conf/new_account_id.txt.bak");
	})

	after("restore the users directory backup", () => {
		fs.rmSync("users", { recursive: true });
		fs.renameSync("users_old", "users");

		fs.rmSync("usersSteamLinks", { recursive: true });
		fs.renameSync("usersSteamLinks_old", "usersSteamLinks");

		fs.rmSync("conf/new_account_id.txt", {});
		fs.renameSync("conf/new_account_id.txt.bak", "conf/new_account_id.txt");
	})

	it("should enforce all queries", (done) => {
		request(app)
			.post("/api/v1/steam_users")
			.expect("Content-Type", "application/json; charset=utf-8")
			.expect(400)
			.end((err, res) => {
				if (err) return done(err);
				const json = JSON.parse(res.text);
				expect(json).to.deep.equal({
					error: 400,
					error_msg: "Missing field"
				})
				return done();
			});
	})

	describe("Test account", () => {
		let authToken;

		it("Create test account", (done) => {
			request(app)
				.post("/api/v1/steam_users")
				.send("steam_id=1234&steam_auth_ticket=invalid&steam_persona=Tester&steam_nickname=Tester")
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(200)
				.end((err, res) => {
					if (err) return done(err);
					const json = JSON.parse(res.text);
					expect(json.account_type).to.equals("user");
					expect(json.api_v2_supported).to.equals(true);
					expect(json.username).to.equals("Tester");
					expect(json).to.have.property("blocks_inventory_str");

					expect(json).to.have.property("world_templates");
					for (const template of json.world_templates) {
						expect(template).to.have.keys(
							["hidden", "id", "image_urls_for_sizes", "title", "world_source" ])
					}

					authToken = json.auth_token;
					return done();
				});
		})

		it("Get current worlds", (done) => {
			request(app)
				.get("/api/v1/current_user/worlds")
				.set("BW-Auth-Token", authToken)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(200)
				.end((err, res) => {
					if (err) return done(err);
					return done();
				})
		});
	})

});
