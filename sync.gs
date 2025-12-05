/***********************
 * Family Calendar Sync
 *  - 複数カレンダーの予定を
 *    ファミリーカレンダーに集約表示する
 *  - カレンダーごとに
 *    ・タイトルをマスクする("masked")
 *    ・元タイトルのままコピー("original")
 *    を選択可能
 ***********************/


/***********************
 * 設定部分
 ***********************/

// ▼ ファミリーカレンダーのID（出力先）
// Googleカレンダー → 左の「ファミリー」カレンダー → 「設定と共有」
// → 「カレンダーの統合」→「カレンダーID」をここに貼り付け
const FAMILY_CALENDAR_ID = "TODO: your_family_calendar_id@group.calendar.google.com";

// ▼ 同期したい元カレンダーの一覧
// name: ファミリー側タイトルに使う表示名
// id  : 各カレンダーの「カレンダーID」
// copyMode:
//   "masked"   → 「カレンダー名：予定あり」
//   "original" → 元のタイトルをそのままコピー
const SOURCE_CALENDARS = [
  { name: "AutoSchedule",        id: "TODO: AutoSchedule_calendar_id",        copyMode: "original" },
  { name: "プライベート",        id: "TODO: private_calendar_id",            copyMode: "masked" },
  { name: "仕事",                id: "TODO: work_calendar_id",               copyMode: "masked" },
];

// ▼ どの期間を同期対象にするか
// 例：過去1日〜未来90日
const PAST_DAYS   = 30;
const FUTURE_DAYS = 60;

// ▼ ファミリー側で「自動生成イベント」を見分けるための目印
const AUTO_MARK = "[AUTO_SYNC_FAMILY]";

// ▼ レート制限対策用：まとめて何件ごとに sleep するか
const DELETE_BATCH_SIZE = 50;   // 削除で何件ごとに休むか
const CREATE_BATCH_SIZE = 50;   // 作成で何件ごとに休むか
const SLEEP_MS          = 1000; // 休む時間（ミリ秒）：例 1000ms = 1秒

/***********************
 * メイン処理
 ***********************/
function syncFamilyCalendar() {
  const familyCal = CalendarApp.getCalendarById(FAMILY_CALENDAR_ID);
  if (!familyCal) {
    throw new Error("ファミリーカレンダーIDが間違っている可能性があります: " + FAMILY_CALENDAR_ID);
  }

  const now = new Date();
  const start = new Date(now.getTime() - PAST_DAYS * 24 * 60 * 60 * 1000);
  const end   = new Date(now.getTime() + FUTURE_DAYS * 24 * 60 * 60 * 1000);

  // --- 1. 期間内の自動生成イベントを削除（バッチ＋sleep） ---
  deleteAutoEventsWithSleep(familyCal, start, end);

  // --- 2. 各カレンダーから予定を取得して、ファミリーに追加（バッチ＋sleep） ---
  let createdCount = 0;

  SOURCE_CALENDARS.forEach(src => {
    const srcCal = CalendarApp.getCalendarById(src.id);
    if (!srcCal) {
      Logger.log("カレンダーが見つかりません: " + src.name + " (" + src.id + ")");
      return;
    }

    const events = srcCal.getEvents(start, end);
    Logger.log("Syncing from: " + src.name + " / events: " + events.length);

    events.forEach(e => {
      const title = getTitleForFamily(src, e);

      const options = {
        description: AUTO_MARK + " from " + src.name,
        // location をコピーしたくない場合はコメントアウトのままでOK
        // location: e.getLocation(),
      };

      try {
        if (e.isAllDayEvent()) {
          familyCal.createAllDayEvent(
            title,
            e.getAllDayStartDate(),
            e.getAllDayEndDate(),
            options
          );
        } else {
          familyCal.createEvent(
            title,
            e.getStartTime(),
            e.getEndTime(),
            options
          );
        }
        createdCount++;

        // 一定件数作成するごとに少し休む
        if (createdCount % CREATE_BATCH_SIZE === 0) {
          Logger.log("Created " + createdCount + " events, sleeping " + SLEEP_MS + " ms...");
          Utilities.sleep(SLEEP_MS);
        }
      } catch (err) {
        Logger.log("Error creating event from " + src.name + ": " + err);
      }
    });
  });

  Logger.log("Family calendar sync finished. Total created: " + createdCount);
}


/***********************
 * 自動生成イベント削除（バッチ＋sleep）
 ***********************/
function deleteAutoEventsWithSleep(familyCal, start, end) {
  const existing = familyCal.getEvents(start, end, { search: AUTO_MARK });
  Logger.log("Existing auto events to delete: " + existing.length);

  let deletedCount = 0;

  for (let i = 0; i < existing.length; i++) {
    try {
      existing[i].deleteEvent();
      deletedCount++;
    } catch (err) {
      Logger.log("Error deleting event: " + err);
    }

    // 一定件数削除するごとに少し休む
    if (deletedCount > 0 && deletedCount % DELETE_BATCH_SIZE === 0) {
      Logger.log("Deleted " + deletedCount + " events, sleeping " + SLEEP_MS + " ms...");
      Utilities.sleep(SLEEP_MS);
    }
  }

  Logger.log("Finished deleting auto events. Total deleted: " + deletedCount);
}


/***********************
 * タイトル決定ロジック
 ***********************/
function getTitleForFamily(srcCalendarConfig, event) {
  const mode = srcCalendarConfig.copyMode || "masked";

  if (mode === "original") {
    // 元のタイトルをそのまま使う
    const originalTitle = event.getTitle();
    // 空タイトル対策（念の為）
    if (!originalTitle || originalTitle.trim() === "") {
      return srcCalendarConfig.name + "：予定あり";
    }
    return originalTitle;
  }

  // デフォルト（masked）
  return srcCalendarConfig.name + "：予定あり";
}
