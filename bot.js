"use strict";

const settings = require("./settings.json"); // Данные для БД
const mysql = require("mysql"); // Библиотека для работы с базой данных
const TelegramBot = require("node-telegram-bot-api"); // Библиотека для работы с ботом Телеграм
const axios = require("axios"); // Библиотека для работы с запросами
const md5 = require("md5"); // Библиотека для хеширования пароля по md5
const reboottime = settings.reboottime;
let token = []; // Токен текущего бота
let staffID = []; // Переменная для записи актуальных сотрудников
let chatID; // telegram ID текущего пользователя
let adrlist = []; // Массив IP адресов вызывных панелей
let offlinePanel = []; // Массив offline вызывных панелей
axios.defaults.timeout = 500;

/** Начало получения данных из БД */

// Подключение к базе данных
const connection = mysql.createPool({
  host: "195.93.252.183",
  user: "staff",
  password: "pa$$w0rd",
  database: "bas-ip",
});
connection.getConnection(function (err) {
  if (err) throw err;
});

// Получение токена из БД
connection.query(
  `SELECT toktelegram.token FROM toktelegram JOIN object ON toktelegram.objectid = object.id
  WHERE object.id = ` + settings.access2,
  function (err, rows) {
    if (err) throw err;
    token[0] = rows[0].token;
  }
);

// Выводим текущий объект
connection.query(
  `SELECT name FROM object WHERE id = ` + settings.access2,
  function (err, rows) {
    if (err) throw err;
    console.log(`Данный объект: ${rows[0].name}`);
  }
);

// Получение списка IP
connection.query(
  `SELECT ip.ip, ip.name FROM ip JOIN object ON ip.objectid = object.id
    WHERE object.id = ` + settings.access2,
  function (err, rows) {
    if (err) throw err;
    rows.forEach(function (row) {
      adrlist.push([row.ip, row.name]);
    });
  }
);

// Описываем функцию проверки сотрудников из БД
function staffstatus() {
  staffID = [];
  connection.query(
    `SELECT staff.telegramid FROM staff JOIN object ON staff.accesslevel = object.id WHERE object.id = ` +
      settings.access2 +
      ` OR object.id = ` +
      settings.access1,
    function (err, rows) {
      if (err) throw err;
      rows.forEach(function (row) {
        staffID[staffID.length] = "" + row.telegramid;
      });
    }
  );
}

/** Конец получения данных из БД */

async function check() {
  for (let i = 0; i != adrlist.length; i++) {
    try {
      await axios.get(`${adrlist[i][0]}api/info`);
    } catch {
      offlinePanel.push(adrlist[i].join(" - "));
    }
  }

  if (offlinePanel != 0) {
    offlinePanel.unshift("Следующие вызывные панели не работают:\n");
    offlinePanel = offlinePanel.join("\n");
    if (chatID == undefined) {
      for (let i = 0; i < staffID.length; i++) {
        bot.sendMessage(staffID[i], `${offlinePanel}`);
      }
    } else {
      bot.sendMessage(chatID, `${offlinePanel}`);
      chatID = null;
    }
  } else {
    offlinePanel.push("Все вызывные панели работают.");
    if (chatID == undefined) {
      for (let i = 0; i < staffID.length; i++) {
        bot.sendMessage(staffID[i], `${offlinePanel}`);
      }
    } else {
      bot.sendMessage(chatID, `${offlinePanel}`);
      chatID = null;
    }
  }

  offlinePanel = [];
}

async function reboot() {
  for (let i = 0; i != adrlist.length; i++) {
    let token;

    try {
      await axios.get(`${adrlist[i][0]}api/info`);
    } catch {
      offlinePanel.push(`${adrlist[i].join(" - ")} - Нет связи`);
      continue;
    }

    try {
      const login = await axios.get(
        `${adrlist[i][0]}api/${settings.version}/login?username=admin&password=${md5(
          settings.callpanel.password
        )}`
      );
      token = login.data.token;
    } catch {
      offlinePanel.push(`${adrlist[i].join(" - ")} - Неверный пароль`);
      continue;
    }

    await axios.get(`${adrlist[i][0]}api/${settings.version}/system/reboot/run`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  if (offlinePanel != 0) {
    offlinePanel.unshift(
      "Следующие вызывные панели не перезапустились:\n"
    );
    offlinePanel = offlinePanel.join("\n");
    if (chatID == undefined) {
      for (let i = 0; i < staffID.length; i++) {
        bot.sendMessage(staffID[i], `${offlinePanel}`);
      }
    } else {
      bot.sendMessage(chatID, `${offlinePanel}`);
      chatID = null;
    }
  } else {
    offlinePanel.push("Все вызывные панели перезапустились.");
    if (chatID == undefined) {
      for (let i = 0; i < staffID.length; i++) {
        bot.sendMessage(staffID[i], `${offlinePanel}`);
      }
    } else {
      bot.sendMessage(chatID, `${offlinePanel}`);
      chatID = null;
    }
  }

  offlinePanel = [];
}

// Вызываем функцию получения действующих сотрудников из БД
staffstatus();

// Вызываем функцию обновления действующих сотрудников из БД раз в 10 минут
setInterval(() => {
  staffstatus();
}, 600 * 1000);

const bot = new TelegramBot(token, { polling: true });

// Обрабатываем любые сообщения в телеграме
bot.on("message", (msg) => {
  chatID = msg.chat.id;

  // Для теста
  if (msg.text === "1") {
  }

  // Отправка запроса на регистрацию
  if (msg.text === "/registration") {
    if (staffID.includes(`${chatID}`)) {
      bot.sendMessage(chatID, "Вы уже сотрудник.");
    } else {
      bot.sendMessage(
        staffID[0],
        `Новая заявка сотрудника:\nID: ${msg.chat.id}\n Имя: ${msg.chat.first_name}\n Никнейм: ${msg.from.username}`
      );
      bot.sendMessage(
        chatID,
        `Ваша заявка отправлена на рассмотрение администратору.`
      );
    }
  }

  // Проверка состояния вызывных панелей
  if (msg.text === "/check") {
    if (staffID.includes(`${chatID}`)) {
      bot.sendMessage(
        chatID,
        "Функция проверки запущена. Ожидайте результатов."
      );
      check();
    } else {
      bot.sendMessage(chatID, `Вы не сотрудник компании.`);
    }
  }

  // Перезагрузка вызывных панелей
  if (msg.text === "/reboot") {
    if (staffID.includes(`${chatID}`)) {
      bot.sendMessage(
        chatID,
        "Функция перезапуска запущена. Ожидайте результатов."
      );
      reboot();
    } else {
      bot.sendMessage(chatID, `Вы не сотрудник компании.`);
    }
  }
});

setInterval(() => {
  const date = new Date();
  let time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  if (reboottime.includes(time)) {
    for (let i = 0; i < staffID.length; i++) {
      bot.sendMessage(staffID[i], `Запуск автоматического перезапуска панелей`);
    }
    reboot();
  }
}, 1000);

console.log("App created by Dmitriy Chernyaev <dch@kwel.ru>");
