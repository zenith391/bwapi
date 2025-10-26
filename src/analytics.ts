import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { parse as uuidParse, v7 as uuidv7 } from "uuid";

export enum EventType {
  STEAM_LOGIN,
  IOS_LOGIN,
  LAUNCHER_LOGIN,
}

interface LoginRow {
  /// The Unix timestamp of the Event, expressed in seconds relative to UTC.
  created_at: number;
  event_type: EventType;
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
  console.log("EARLIST TIME:" + earliest_time);
  console.log("NOW: " + new Date());

  await file.write("Data,Players\n");
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
    await file.write(date_string + "," + counter);

    current_day.setUTCDate(current_day.getUTCDate() + 1);
  }
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
