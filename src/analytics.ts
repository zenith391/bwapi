import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { parse as uuidParse, v7 as uuidv7 } from "uuid";

export enum EventType {
  STEAM_LOGIN = "STEAM_LOGIN",
  IOS_LOGIN = "IOS_LOGIN",
  LAUNCHER_LOGIN = "LAUNCHER_LOGIN",
}

interface LoginRow {
  /// The Unix timestamp of the Event, expressed in seconds relative to UTC.
  created_at: number;
  event_type: EventType;
}

export async function migrateOldFiles(db: Database) {
  async function migrateType(type: string, event_type: EventType) {
    try {
      const file = await fs.open("./" + type + "_active_players.csv", "r");
      console.log("Starting migration of analytics of '" + type + "'");
      for await (const line of file.readLines()) {
        if (line == "Date,Players" || line == "Data,Players") continue;
        const date = new Date(line.split(",")[0] + " UTC");
        const count = parseInt(line.split(",")[1]);
        if (date == null || date === undefined || count === undefined) {
          console.error("INVALID LINE: " + line);
          continue;
        }
        for (let j = 0; j < count; j++) {
          await insertLogin(db, event_type, date);
        }
      }
      await file.close();

      await fs.rename(
        "./" + type + "_active_players.csv",
        "./" + type + "_active_players.csv.bak",
      );
    } catch (e) {}
  }

  await migrateType("steam", EventType.STEAM_LOGIN);
  await migrateType("ios", EventType.IOS_LOGIN);
  await migrateType("launcher", EventType.LAUNCHER_LOGIN);
}

async function updateCsvFiles(db: Database) {
  const steam_logins = await db.all<LoginRow[]>(
    `SELECT created_at, event_type FROM Events WHERE event_type = "STEAM_LOGIN" ORDER BY created_at ASC`,
  );

  const file = await fs.open("./steam_active_players_v2.csv", "w");
  const earliest_time = new Date(steam_logins[0].created_at * 1000);
  earliest_time.setUTCHours(0, 0, 0, 0); // set to the start of the day

  // Iterate all days since the earliest event in the database
  let current_day = earliest_time;

  await file.write("Date,Players\n");
  while (current_day < new Date()) {
    let counter = 0;
    const end_of_day = new Date(current_day);
    end_of_day.setUTCHours(23, 59, 59, 999);

    for (const login of steam_logins) {
      const login_date = new Date(login.created_at * 1000);
      if (login_date >= current_day && login_date <= end_of_day) {
        counter++;
      }
    }

    let date_string = current_day.toLocaleDateString("en-US");
    await file.write(date_string + "," + counter + "\n");

    current_day.setUTCDate(current_day.getUTCDate() + 1);
  }
  await file.close();
}

export async function insertLogin(db: Database, type: EventType, time: Date) {
  console.log("Logging in of type " + type + " at " + time);
  const result = await db.run(
    `INSERT INTO Events(uuid, created_at, event_type) VALUES (:id, :time, :type)`,
    {
      ":id": uuidParse(uuidv7()),
      ":time": Math.floor(time.getTime() / 1000),
      ":type": type.toString(),
    },
  );
  await updateCsvFiles(db);
}
