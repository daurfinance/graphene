import { Telegraf, session, Markup } from "telegraf"
import { createClient } from "@neondatabase/serverless"

// Инициализация базы данных
const sql = createClient(process.env.DATABASE_URL)

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// Настройка сессии
bot.use(session())

// Обработка команды /start
bot.start(async (ctx) => {
  await registerUser(ctx)
  await ctx.reply(
    `👋 Привет, ${ctx.from.first_name}! Добро пожаловать в официальный бот проекта Graphene.\n\n` +
      `Graphene — это токенизированная Web3-платформа для масштабного производства графена на блокчейне Solana.`,
    Markup.keyboard([
      ["💰 Баланс", "🎁 Эйрдроп"],
      ["👥 Рефералы", "📊 Статистика"],
      ["ℹ️ О проекте", "🔄 Купить токены"],
    ]).resize(),
  )
})

// Обработка текстовых сообщений
bot.on("text", async (ctx) => {
  const text = ctx.message.text

  switch (text) {
    case "💰 Баланс":
      await showBalance(ctx)
      break
    case "🎁 Эйрдроп":
      await showAirdropTasks(ctx)
      break
    case "👥 Рефералы":
      await showReferrals(ctx)
      break
    case "📊 Статистика":
      await showStats(ctx)
      break
    case "ℹ️ О проекте":
      await showAbout(ctx)
      break
    case "🔄 Купить токены":
      await showBuyTokens(ctx)
      break
    default:
      await ctx.reply("Пожалуйста, используйте меню для навигации.")
  }
})

// Функция регистрации пользователя
async function registerUser(ctx) {
  const userId = ctx.from.id
  const username = ctx.from.username || ""
  const firstName = ctx.from.first_name || ""
  const lastName = ctx.from.last_name || ""

  try {
    // Проверяем, существует ли пользователь
    const existingUser = await sql`
      SELECT * FROM users WHERE telegram_id = ${userId}
    `

    if (existingUser.length === 0) {
      // Создаем нового пользователя
      await sql`
        INSERT INTO users (
          telegram_id, 
          username, 
          first_name, 
          last_name, 
          balance, 
          referral_code, 
          joined_at
        ) 
        VALUES (
          ${userId}, 
          ${username}, 
          ${firstName}, 
          ${lastName}, 
          ${0}, 
          ${generateReferralCode(userId)}, 
          ${new Date()}
        )
      `
      console.log(`Новый пользователь зарегистрирован: ${firstName} ${lastName} (${userId})`)
    } else {
      console.log(`Пользователь уже существует: ${firstName} ${lastName} (${userId})`)
    }
  } catch (error) {
    console.error("Ошибка при регистрации пользователя:", error)
  }
}

// Функция генерации реферального кода
function generateReferralCode(userId) {
  return `GRAPH${userId.toString().substring(0, 6)}`
}

// Функция отображения баланса
async function showBalance(ctx) {
  const userId = ctx.from.id

  try {
    const user = await sql`
      SELECT balance, wallet_address FROM users WHERE telegram_id = ${userId}
    `

    if (user.length > 0) {
      const balance = user[0].balance || 0
      const walletAddress = user[0].wallet_address || null

      let message = `💰 *Ваш баланс*: ${balance} $GRAPH\n\n`

      if (walletAddress) {
        message += `🔑 *Ваш кошелек*: \`${walletAddress}\`\n\n`
      } else {
        message += "⚠️ У вас еще не подключен кошелек Solana. Подключите кошелек, чтобы получать токены.\n\n"
      }

      const buttons = []
      if (!walletAddress) {
        buttons.push(Markup.button.callback("🔑 Подключить кошелек", "connect_wallet"))
      }

      buttons.push(Markup.button.callback("🔄 Обновить баланс", "refresh_balance"))

      await ctx.replyWithMarkdown(message, Markup.inlineKeyboard([buttons]))
    } else {
      await ctx.reply("Произошла ошибка при получении данных. Пожалуйста, попробуйте позже.")
    }
  } catch (error) {
    console.error("Ошибка при отображении баланса:", error)
    await ctx.reply("Произошла ошибка при получении данных. Пожалуйста, попробуйте позже.")
  }
}

// Функция отображения заданий эйрдропа
async function showAirdropTasks(ctx) {
  const userId = ctx.from.id

  try {
    // Получаем информацию о заданиях пользователя
    let tasks = await sql`
      SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
    `

    // Если заданий нет, создаем их
    if (tasks.length === 0) {
      await sql`
        INSERT INTO airdrop_tasks (user_id, task_type, completed)
        VALUES 
          (${userId}, 'connect_wallet', false),
          (${userId}, 'join_channel', false),
          (${userId}, 'follow_twitter', false),
          (${userId}, 'invite_friend', false),
          (${userId}, 'complete_quiz', false)
      `

      // Получаем созданные задания
      tasks = await sql`
        SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
      `
    }

    // Подсчитываем количество выполненных заданий
    const completedTasks = tasks.filter((task) => task.completed).length
    const totalTasks = tasks.length
    const progress = Math.round((completedTasks / totalTasks) * 100)

    // Формируем прогресс-бар
    const progressBarLength = 10
    const filledBlocks = Math.round((progress / 100) * progressBarLength)
    const progressBar = "▓".repeat(filledBlocks) + "░".repeat(progressBarLength - filledBlocks)

    let message =
      `🎁 *Эйрдроп $GRAPH токенов*\n\n` +
      `Выполните все задания и получите 100 $GRAPH токенов!\n\n` +
      `Прогресс: ${completedTasks}/${totalTasks} заданий\n` +
      `[${progressBar}] ${progress}%\n\n` +
      `*Задания:*\n`

    // Формируем список заданий
    const taskButtons = []

    for (const task of tasks) {
      const taskName = getTaskName(task.task_type)
      const taskStatus = task.completed ? "✅" : "⬜"
      const taskReward = getTaskReward(task.task_type)

      message += `${taskStatus} ${taskName} (+${taskReward} $GRAPH)\n`

      if (!task.completed) {
        taskButtons.push([Markup.button.callback(`${taskName}`, `complete_task_${task.task_type}`)])
      }
    }

    // Добавляем кнопку для получения токенов, если все задания выполнены
    if (completedTasks === totalTasks) {
      message += `\n✅ Все задания выполнены! Нажмите кнопку ниже, чтобы получить ваши токены.`
      taskButtons.push([Markup.button.callback("🎁 Получить 100 $GRAPH", "claim_airdrop")])
    }

    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(taskButtons))
  } catch (error) {
    console.error("Ошибка при получении заданий эйрдропа:", error)
    await ctx.reply("❌ Произошла ошибка при загрузке заданий эйрдропа. Пожалуйста, попробуйте позже.")
  }
}

// Функция получения названия задания
function getTaskName(taskType) {
  switch (taskType) {
    case "connect_wallet":
      return "Подключить кошелек"
    case "join_channel":
      return "Подписаться на канал"
    case "follow_twitter":
      return "Подписаться на Twitter"
    case "invite_friend":
      return "Пригласить друга"
    case "complete_quiz":
      return "Пройти квиз о графене"
    default:
      return "Неизвестное задание"
  }
}

// Функция получения награды за задание
function getTaskReward(taskType) {
  switch (taskType) {
    case "connect_wallet":
      return 10
    case "join_channel":
      return 15
    case "follow_twitter":
      return 15
    case "invite_friend":
      return 30
    case "complete_quiz":
      return 30
    default:
      return 0
  }
}

// Функция отображения реферальной системы
async function showReferrals(ctx) {
  const userId = ctx.from.id

  try {
    // Получаем информацию о пользователе и его рефералах
    const user = await sql`
      SELECT referral_code FROM users WHERE telegram_id = ${userId}
    `

    const referrals = await sql`
      SELECT COUNT(*) as count FROM users WHERE referred_by = ${userId}
    `

    const referralCount = referrals[0]?.count || 0
    const referralCode = user[0]?.referral_code || generateReferralCode(userId)
    const referralLink = `https://t.me/graphene_bot?start=${referralCode}`

    await ctx.replyWithMarkdown(
      `👥 *Реферальная программа*\n\n` +
        `Приглашайте друзей и получайте токены $GRAPH!\n\n` +
        `🔗 *Ваша реферальная ссылка:*\n` +
        `\`${referralLink}\`\n\n` +
        `📊 *Статистика:*\n` +
        `- Приглашено друзей: ${referralCount}\n` +
        `- Заработано токенов: ${referralCount * 30} $GRAPH\n\n` +
        `💰 За каждого приглашенного друга вы получаете 30 $GRAPH!`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 Скопировать ссылку", "copy_referral_link")],
        [
          Markup.button.url(
            "📱 Поделиться в Telegram",
            `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Присоединяйся к Graphene и получи бесплатные токены $GRAPH!")}`,
          ),
        ],
      ]),
    )
  } catch (error) {
    console.error("Ошибка при получении данных о рефералах:", error)
    await ctx.reply("❌ Произошла ошибка при загрузке реферальной программы. Пожалуйста, попробуйте позже.")
  }
}

// Функция отображения статистики
async function showStats(ctx) {
  try {
    const stats = await sql`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT SUM(balance) FROM users) as total_tokens,
        (SELECT COUNT(*) FROM airdrop_tasks WHERE completed = true) as completed_tasks
    `

    if (stats.length > 0) {
      const totalUsers = stats[0].total_users || 0
      const totalTokens = stats[0].total_tokens || 0
      const completedTasks = stats[0].completed_tasks || 0

      await ctx.replyWithMarkdown(
        `📊 *Статистика проекта Graphene*\n\n` +
          `👥 Всего пользователей: ${totalUsers}\n` +
          `💰 Токенов в обращении: ${totalTokens} $GRAPH\n` +
          `✅ Выполнено заданий: ${completedTasks}\n\n` +
          `🚀 Присоединяйтесь к нашему сообществу и станьте частью революции в производстве графена!`,
        Markup.inlineKeyboard([
          [Markup.button.url("🌐 Веб-сайт", "https://graphene.com")],
          [Markup.button.url("📢 Telegram канал", "https://t.me/graphene_channel")],
        ]),
      )
    } else {
      await ctx.reply("Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.")
    }
  } catch (error) {
    console.error("Ошибка при отображении статистики:", error)
    await ctx.reply("Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.")
  }
}

// Функция отображения информации о проекте
async function showAbout(ctx) {
  await ctx.replyWithMarkdown(
    `ℹ️ *О проекте Graphene*\n\n` +
      `Graphene — это токенизированная Web3-платформа для масштабного производства графена на блокчейне Solana.\n\n` +
      `*Что такое графен?*\n` +
      `Графен — это двумерная аллотропная модификация углерода, образованная слоем атомов углерода толщиной в один атом. Обладает уникальными свойствами: высокой электро- и теплопроводностью, прочностью и гибкостью.\n\n` +
      `*Наша миссия*\n` +
      `Проект Graphene стремится демократизировать доступ к производству и использованию графена через токенизацию и блокчейн-технологии. Мы создаем экосистему, где каждый может стать частью революции в материаловедении.\n\n` +
      `*Токен $GRAPH*\n` +
      `$GRAPH — это utility-токен экосистемы Graphene на блокчейне Solana. Общее предложение: 100,000,000 $GRAPH.`,
    Markup.inlineKeyboard([
      [Markup.button.url("🌐 Веб-сайт", "https://graphene.com")],
      [Markup.button.url("📄 Whitepaper", "https://graphene.com/whitepaper")],
      [Markup.button.callback("💰 Токеномика", "tokenomics")],
    ]),
  )
}

// Функция отображения информации о покупке токенов
async function showBuyTokens(ctx) {
  await ctx.replyWithMarkdown(
    `🔄 *Купить токены $GRAPH*\n\n` +
      `Текущий курс: 1 SOL = 1000 $GRAPH\n\n` +
      `Для покупки токенов выберите один из способов ниже:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("💳 Купить с помощью SOL", "buy_with_sol")],
      [Markup.button.url("🔄 Купить на DEX", "https://raydium.io/swap/")],
      [Markup.button.callback("❓ Инструкция по покупке", "buy_instructions")],
    ]),
  )
}

// Обработчик команды /start с реферальным кодом
bot.hears(/\/start (.+)/, async (ctx) => {
  const referralCode = ctx.match[1]
  const userId = ctx.from.id

  try {
    // Проверяем, существует ли пользователь с таким реферальным кодом
    const referrer = await sql`
      SELECT telegram_id FROM users WHERE referral_code = ${referralCode}
    `

    if (referrer.length > 0 && referrer[0].telegram_id !== userId) {
      const referrerId = referrer[0].telegram_id

      // Проверяем, не был ли пользователь уже приглашен
      const user = await sql`
        SELECT referred_by FROM users WHERE telegram_id = ${userId}
      `

      if (user.length > 0 && !user[0].referred_by) {
        // Обновляем информацию о пользователе
        await sql`
          UPDATE users SET referred_by = ${referrerId} WHERE telegram_id = ${userId}
        `

        // Начисляем токены рефереру
        await sql`
          UPDATE users SET balance = balance + 30 WHERE telegram_id = ${referrerId}
        `

        // Уведомляем реферера
        await ctx.telegram.sendMessage(
          referrerId,
          `🎉 Поздравляем! По вашей реферальной ссылке зарегистрировался новый пользователь. Вам начислено 30 $GRAPH!`,
        )

        await ctx.reply("✅ Вы успешно присоединились по реферальной ссылке!")
      }
    }
  } catch (error) {
    console.error("Ошибка при обработке реферальной ссылки:", error)
  }

  // Продолжаем стандартную обработку команды /start
  await registerUser(ctx)
  await ctx.reply(
    `👋 Привет, ${ctx.from.first_name}! Добро пожаловать в официальный бот проекта Graphene.\n\n` +
      `Graphene — это токенизированная Web3-платформа для масштабного производства графена на блокчейне Solana.`,
    Markup.keyboard([
      ["💰 Баланс", "🎁 Эйрдроп"],
      ["👥 Рефералы", "📊 Статистика"],
      ["ℹ️ О проекте", "🔄 Купить токены"],
    ]).resize(),
  )
})

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}`, err)
  ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже или обратитесь в поддержку.")
})

// Запуск бота
bot
  .launch()
  .then(() => {
    console.log("Бот запущен!")
  })
  .catch((err) => {
    console.error("Ошибка при запуске бота:", err)
  })

// Включаем graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
