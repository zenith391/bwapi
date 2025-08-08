import { expect } from "chai";
import request from "supertest";
import app from "../modules/app.js";
import fs from "fs";

describe("Login with Steam", () => {
  before("backup users directory", () => {
    fs.renameSync("users", "users_old");
    fs.mkdirSync("users", {});

    fs.renameSync("worlds", "worlds_old");
    fs.mkdirSync("worlds", {});

    fs.renameSync("usersSteamLinks", "usersSteamLinks_old");
    fs.mkdirSync("usersSteamLinks", {});

    fs.copyFileSync("conf/new_world_id.txt", "conf/new_world_id.txt.bak");
    fs.copyFileSync("conf/new_account_id.txt", "conf/new_account_id.txt.bak");
  });

  after("restore the users directory backup", () => {
    fs.rmSync("users", { recursive: true });
    fs.renameSync("users_old", "users");

    fs.rmSync("worlds", { recursive: true });
    fs.renameSync("worlds_old", "worlds");

    fs.rmSync("usersSteamLinks", { recursive: true });
    fs.renameSync("usersSteamLinks_old", "usersSteamLinks");

    fs.rmSync("conf/new_world_id.txt", {});
    fs.renameSync("conf/new_world_id.txt.bak", "conf/new_world_id.txt");
    fs.rmSync("conf/new_account_id.txt", {});
    fs.renameSync("conf/new_account_id.txt.bak", "conf/new_account_id.txt");
  });

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
          error_msg: "Missing field",
        });
        return done();
      });
  });

  describe("Test account", () => {
    let authToken;
    let userId;
    let secondUserId;
    let secondAuthToken;

    it("Create test account", (done) => {
      request(app)
        .post("/api/v1/steam_users")
        .send(
          "steam_id=1234&steam_auth_ticket=invalid&steam_persona=Tester&steam_nickname=Tester",
        )
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
            expect(template).to.have.keys([
              "hidden",
              "id",
              "image_urls_for_sizes",
              "title",
              "world_source",
            ]);
          }

          authToken = json.auth_token;
          userId = json.id;
          return done();
        });
    });

    it("Create second account", (done) => {
      request(app)
        .post("/api/v1/steam_users")
        .send(
          "steam_id=12345&steam_auth_ticket=invalid&steam_persona=Tester2&steam_nickname=Tester2",
        )
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          const json = JSON.parse(res.text);
          secondUserId = json.id;
          secondAuthToken = json.auth_token;
          return done();
        });
    });

    for (let i = 0; i < 10; i++) {
      it("Create world #" + (i + 1).toString(), (done) => {
        request(app)
          .post("/api/v1/worlds")
          .set("BW-Auth-Token", i % 2 == 0 ? authToken : secondAuthToken)
          .set("BW-App-Version", "1.47.0")
          .field("title", "Test World")
          .field("description", "")
          .field("has_win_condition", "false")
          .field("source_json_str", '{"blocks":[]}')
          .expect("Content-Type", "application/json; charset=utf-8")
          .expect(200)
          .end((err, res) => {
            if (err) return done(err);
            return done();
          });
      });
    }

    it("Get current worlds", (done) => {
      request(app)
        .get("/api/v1/current_user/worlds")
        .set("BW-Auth-Token", authToken)
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          const json = JSON.parse(res.text);
          console.log(json.text);
          return done();
        });
    });

    it("Get pending payouts", (done) => {
      request(app)
        .get("/api/v1/current_user/pending_payouts")
        .set("BW-Auth-Token", authToken)
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          return done();
        });
    });

    it("Get liked worlds", (done) => {
      request(app)
        .get("/api/v1/users/" + userId + "/liked_worlds")
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          return done();
        });
    });

    it("Follow Tester2", (done) => {
      request(app)
        .post("/api/v1/user/" + secondUserId + "/follow_activity")
        .set("BW-Auth-Token", authToken)
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          return done();
        });
    });

    it("Get followed users", (done) => {
      request(app)
        .get("/api/v1/user/" + userId + "/followed_users")
        .expect("Content-Type", "application/json; charset=utf-8")
        .expect(200)
        .end((err, res) => {
          console.log(err);
          if (err) return done(err);
          const json = JSON.parse(res.text);
          console.log(json);
          return done();
        });
    });
  });
});
