# EventTimer — передача проекта другой нейронке

Прочитай этот файл целиком, прежде чем менять код. Это операторский таймер мероприятия: Electron-приложение, панель управления и полноэкранная сцена 16:9. Продуктовое описание для людей лежит в `PRODUCT.md`. Версия в `package.json`: **1.3.3**.

Репозиторий, куда можно пушить: `https://github.com/vasilyevslava/EventTimer.git`, ветка `main`.  
Не пушь в `https://github.com/mirslava88/timer-plus`. Не переименовывай локальную папку проекта. Не трогай `git config`.

## Стек и зависимости

Своего бэкенда нет. Всё состояние живёт в процессе Electron и в JSON на диске.

| Пакет | Зачем |
| --- | --- |
| `electron` ^43.2.0 | Оболочка. В обычных сборках фактически 43.3.0 |
| `electron-vite` ^5 | Сборка main / preload / renderer |
| `electron-builder` ^26 | DMG и NSIS |
| `react` и `react-dom` ^19 | Интерфейс |
| `typescript` ^7 | `npm run typecheck` → `tsc --noEmit`. Отдельного `tsconfig.web.json` нет |
| `vite` ^7 и `@vitejs/plugin-react` | Рендерер |
| `sharp` | `scripts/generate-icon.mjs` |
| `@types/node`, `@types/react`, `@types/react-dom` | Типы |

Node для разработки: 24. На машине автора бинарник не в `PATH`, он в `~/.local/node/bin`. Перед Electron обязательно `unset ELECTRON_RUN_AS_NODE`: Cursor выставляет эту переменную, и Electron тогда молча работает как Node.

```bash
export PATH="$HOME/.local/node/bin:$PATH"
unset ELECTRON_RUN_AS_NODE
npm install
npm run dev
```

`npm run typecheck` — проверка типов. Тестов в репозитории нет.

## Сборки

Команды пакуют иконку, `electron-vite build` и `electron-builder`. Их нужно запускать по очереди: они делят `out/` и `dist/`. Сборка сбивает уже запущенный `npm run dev`. Для подписи и `hdiutil` на Mac нужен доступ вне песочницы.

| Команда | Файл | Система |
| --- | --- | --- |
| `npm run package:mac:intel` | `EventTimer-<version>-Intel.dmg` | x64, macOS 12+, конфиг `electron-builder.intel.yml` |
| `npm run package:mac:m` | `EventTimer-<version>-M.dmg` | arm64, macOS 12+, `electron-builder.m.yml` |
| `npm run package:mac:catalina` | `EventTimer-<version>-Catalina.dmg` | x64, macOS 10.15, Electron **32.3.3**, `electron-builder.catalina.yml` |
| `npm run package:win` | `EventTimer-<version>-Windows.exe` | NSIS x64. Сам `.exe` таймера — PE32+ x86-64. Оболочка NSIS может выглядеть как 32-bit stub |

`appId`: `com.mirslava.timerplus`. `productName`: `EventTimer`. Имя пакета npm: `event-timer`. Mac-сборки ad-hoc (`identity: "-"`), hardened runtime, не нотаризованы. Первый запуск на Mac: правый клик → Открыть.

`.github/workflows/build.yml` устарел: он всё ещё целится в файлы и релиз `v1.0.0`. Локальные четыре установщика выше — источник правды для релизов. Не запускай этот workflow вслепую и не дай ему перезаписать старый релиз.

`dist/` в git не входит.

## Карта файлов

- `src/shared.ts` — типы `TimerState`, `ScreenConfig`, слоты сцены, IPC-контракт `TimerPlusApi`.
- `src/main/index.ts` — окна, дисплеи, настройки, звуки, IPC.
- `src/preload/index.ts` — `window.timerPlus`.
- `src/renderer/src/App.tsx` — вся панель оператора: черновик, эфир, кнопки, карточки настроек.
- `src/renderer/src/EventTimerScene.tsx` — сцена превью и эфира.
- `src/renderer/src/timer-utils.ts` — тик, деньги, мигающие пороги, звуковые метки.
- `src/renderer/src/defaults.ts` — `DEFAULT_TIMER`, `normalizeSettings`, `screenConfigFromTimer`.
- `src/renderer/src/styles.css` — сетка окна и сцена.
- `src/renderer/src/fonts.ts` и `src/renderer/src/assets/fonts/` — шрифты сцены.
- `src/renderer/src/scene-layout.ts` — геометрия 16:9.

Новое поле `TimerState` нужно добавить в тип, в `DEFAULT_TIMER`, в `normalizeTimerState` и в `cloneTimer`. Иначе `normalizeSettings` при загрузке его выкинет. Пресеты собираются через `screenConfigFromTimer`: туда не входят `remaining`, `running`, `live`, деньги и elapsed. Если поле должно жить в пресете, его надо явно скопировать в `ScreenConfig`.

## Два состояния: черновик и эфир

`timer` в `App.tsx` — превью. `liveTimer` — то, что уже на экранах. Пока оператор не нажал «Отправить в эфир» или «Обновить эфир», правки превью эфир не меняют.

`publish` и `updateOutput` клонируют черновик и вызывают `goLive`. `updateLive` шлёт каждый тик `liveTimer` в окна вывода.

Кнопка **Live** (`liveControl`) применяет старт, паузу, стоп и сдвиг минут к эфиру сразу. После первой отправки в эфир она выключена. «Сейчас» копирует в превью `duration`, `remaining` и `running` из эфира, деньги не копирует.

Сохранение в `event-timer-settings.json` принудительно пишет `running: false`, `live: false` и оба elapsed в 0. Остаток времени и деньги сохраняются. После перезапуска эфир сам не открывается и таймер не идёт. Файл лежит в `app.getPath('userData')`. Dev и установленный `/Applications/EventTimer.app` делят этот файл: установленное приложение может затереть настройки. Не убивай его без нужды. Не нажимай плей, стоп и сдвиг минут в чужой живой сессии.

Компактного окна в интерфейсе нет. `COMPACT_WINDOW` и IPC `window:layout` ещё есть. Рендерер один раз за сессию просит `expanded`. Не возвращай кнопку «маленький вид» и не ресайзь окно на каждом HMR.

## Часы

`centralTimeMode`: `current` | `timer` | `to-start` | `to-end`. Это крупные цифры в центре. Часы в углу — отдельный слот и всегда показывают время компьютера.

`duration` — вбитая длина. `remaining` — текущий отсчёт, может быть отрицательным.

`adjustMinutes` меняет только `remaining`. Не меняй вместе с ним `duration`: иначе после трёх нажатий −5 рефреш вернёт 0 вместо вбитых 15 минут. Рефреш и стоп ставят `remaining` обратно в `duration`.

«До начала» и «До конца» считаются через `secondsUntilTime` от системных часов. Play / Pause / Stop ими не управляют.

Если при отправке или обновлении эфира режим не `timer`, а `running` ещё true, `airPayload` ставит паузу. Смена режима только в превью таймер не останавливает. Возврат на «Таймер» сам не жмёт плей.

## Деньги перелимита

На экране одна цифра: `overtimeCostTotal`. Её собирает `presentCost`: bank + session + живой счётчик + кредит.

- `overtimeCostBanked` — уже записанные перелимиты таймера. Секунды мероприятия сюда не пишутся.
- `sessionOvertimeCost` — деньги только текущего запуска таймера.
- `scheduleOvertimeCost` — живой счётчик времени мероприятия с момента выбора режима.
- `fullEventOvertimeCredit` — добавка кнопки «Учитывать перелимит всего мероприятия».
- `scheduleOvertimeElapsed` и `timerOvertimeElapsed` — хвост внутри интервала «Обновлять, сек», ещё не превращённый в деньги.

Режимы `overtimeMode`: `schedule` («Время перелимита мероприятия»), `timer` («Таймер»), `both` («Таймер + время перелимита мероприятия»), `none` («Не учитывать перелимиты»). Ставки: `scheduleCostPerMinute`, `timerCostPerMinute`. Деньги таймера капают только пока `timer.running` и отсчёт в минусе. Деньги времени мероприятия капают после `endTime`, даже если таймер на паузе. В режиме `none` новые деньги не капают, а `overtimeHoldTotal` держит сумму, которая была на экране в момент включения. `countFullEventOvertime` по нажатию записывает в `fullEventOvertimeCredit` перелимит мероприятия, которого ещё нет в живом счётчике. Следующий тик увеличивает только `scheduleOvertimeCost` и не пересчитывает кредит. Повторное нажатие обнуляет кредит и вычитает ту же сумму.

`advanceTimer` прибавляет время мероприятия в `scheduleOvertimeCost`, а таймер — в session, затем вызывает `presentCost`. `retargetTimerCost` (кнопки ±минут) переписывает только session по новому `remaining`. Bank не трогает. `commitTimerSession` складывает session в bank и обнуляет session. После `retargetTimerCost` и `commitTimerSession` снова нужен `presentCost`, иначе из итога пропадут живой счётчик и кредит.

Сессия закрывается на стопе, рефреше и когда оператор вводит другую длительность (`commitSession: true`). Пауза и плей сессию не закрывают. «Сбросить итог» обнуляет bank, session, живой счётчик и оба elapsed. Если кнопка всего мероприятия ещё включена, кредит записывается заново. Больше ничто не обнуляет итог.

Старый JSON без bank/session режется в `splitOvertimeCost` и `initialOvertimeCost`: текущий отрицательный остаток считается session, остаток суммы — bank.

## Цвета, мигание, звук

Красные крупные цифры: `digitPhase` в `timer-utils.ts`. При `allowNegative` ноль и минус — overtime. Предупреждение жёлтым, пока `0 < seconds <= 60` и флаг warning включён. На нуле без «уходить в минус» цвет обычный и мигания нет.

`blink` и `blinkSeconds` отдельные для `timer`, `to-start`, `to-end`. По умолчанию мигание включено у таймера и «До конца» за 5 секунд, у «До начала» выключено. Класс сцены: `scene-time is-finishing`. Заголовок не мигает. На нуле мигание есть только если для этого режима включён `allowNegative`.

`costOvertimeRed` красит весь блок стоимости, пока `overtimeCostTotal > 0`. `remainingOvertimeRed` красит весь блок «До завершения», пока конец мероприятия уже в прошлом. Оба по умолчанию включены. Отсутствие поля в старом JSON трактуй как включено (`!== false`).

Звук warning — один раз на переходе `previous >= 60 && seconds < 60`. Звук finish — когда `finishArmed`, предыдущее значение было больше 0 и стало `<= 0`. Пока пауза, `consumeCue(..., false)` двигает previous без звука. Файлы звука до 20 МБ, лежат в `userData/sounds`.

## Сцена и настройки

Шесть слотов: `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight`. Содержимое: `clock`, `date`, `schedule`, `remaining`, `cost`, `empty`. Повтор непустого содержимого меняет слоты местами. `slotShown` отдельно от содержимого: скрыть не значит забыть. Кликабельна вся рамка, не только текст.

Заголовок и название мероприятия — фиксированные центральные плашки, не слоты.

Карточки справа, сверху вниз: «Редактировать отображение» (сразу открыта), «Звуки», «Стоимость», «Вид», «Пресеты». Одна кнопка «Редактировать отображение» включает и правку текста в превью, и меню содержимого на карте. Минус и предупреждение видны для таймера, «До начала» и «До конца» без входа в редактирование. Инспектор выбранного элемента стоит над «Что показывают часы».

Пресеты: 5 штук, имя до 40 символов, карандаш и корзина. Сохраняют только `ScreenConfig`.

Цифры по центру стоят сеткой из трёх колонок, чтобы минус не сдвигал время. Не ломай это без просьбы.

## Жёсткие правила поведения

- Не сбрасывай оператору живой таймер, имя мероприятия, ставки и уже накопленный итог, если он сам об этом не попросил.
- Не включай мигание «До начала» по умолчанию.
- Не крась стоимость и «До завершения» в красный, если соответствующие флаги выключены.
- Стоп не вызывает пересчёт денег заново и не обнуляет итог. Он фиксирует текущую сессию.
- Сдвиг минут не меняет `duration`.
- Пауза таймера не останавливает «До начала» и «До конца»: они от часов компьютера.
- Не добавляй шрифты в другой репозиторий. Файлы уже лежат в `src/renderer/src/assets/fonts/`.
