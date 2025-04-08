import { Telegraf, session, Scenes, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { createClient } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Загрузка переменных окружения
dotenv.config();

// Инициализация базы данных
const sql = createClient(process.env.DATABASE_URL);

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Настройка сессии
bot.use(session());

// Создание сцен
const stage = new Scenes.Stage([
  createWalletScene(),
  createAirdropScene(),
  createReferralScene()
]);
bot.use(stage.middleware());

// Обработка команды /start
bot.start(async (ctx) => {
  await registerUser(ctx);
  await ctx.reply(
    `👋 Привет, ${ctx.from.first_name}! Добро пожаловать в официальный бот проекта Graphene.\n\n` +
    `Graphene — это токенизированная Web3-платформа для масштабного производства графена на блокчейне Solana.`,
    Markup.keyboard([
      ['💰 Баланс', '🎁 Эйрдроп'],
      ['👥 Рефералы', '📊 Статистика'],
      ['ℹ️ О проекте', '🔄 Купить токены']
    ]).resize()
  );
});

// Обработка текстовых сообщений
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text;
  
  switch (text) {
    case '💰 Баланс':
      await showBalance(ctx);
      break;
    case '🎁 Эйрдроп':
      await ctx.scene.enter('airdrop');
      break;
    case '👥 Рефералы':
      await ctx.scene.enter('referral');
      break;
    case '📊 Статистика':
      await showStats(ctx);
      break;
    case 'ℹ️ О проекте':
      await showAbout(ctx);
      break;
    case '🔄 Купить токены':
      await showBuyTokens(ctx);
      break;
    default:
      await ctx.reply('Пожалуйста, используйте меню для навигации.');
  }
});

// Функция регистрации пользователя
async function registerUser(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  
  try {
    // Проверяем, существует ли пользователь
    const existingUser = await sql`
      SELECT * FROM users WHERE telegram_id = ${userId}
    `;
    
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
      `;
      console.log(`Новый пользователь зарегистрирован: ${firstName} ${lastName} (${userId})`);
    } else {
      console.log(`Пользователь уже существует: ${firstName} ${lastName} (${userId})`);
    }
  } catch (error) {
    console.error('Ошибка при регистрации пользователя:', error);
  }
}

// Функция генерации реферального кода
function generateReferralCode(userId) {
  return `GRAPH${userId.toString().substring(0, 6)}`;
}

// Функция отображения баланса
async function showBalance(ctx) {
  const userId = ctx.from.id;
  
  try {
    const user = await sql`
      SELECT balance, wallet_address FROM users WHERE telegram_id = ${userId}
    `;
    
    if (user.length > 0) {
      const balance = user[0].balance || 0;
      const walletAddress = user[0].wallet_address || null;
      
      let message = `💰 *Ваш баланс*: ${balance} $GRAPH\n\n`;
      
      if (walletAddress) {
        message += `🔑 *Ваш кошелек*: \`${walletAddress}\`\n\n`;
      } else {
        message += '⚠️ У вас еще не подключен кошелек Solana. Подключите кошелек, чтобы получать токены.\n\n';
      }
      
      const buttons = [];
      if (!walletAddress) {
        buttons.push(Markup.button.callback('🔑 Подключить кошелек', 'connect_wallet'));
      }
      
      buttons.push(Markup.button.callback('🔄 Обновить баланс', 'refresh_balance'));
      
      await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([buttons])
      );
    } else {
      await ctx.reply('Произошла ошибка при получении данных. Пожалуйста, попробуйте позже.');
    }
  } catch (error) {
    console.error('Ошибка при отображении баланса:', error);
    await ctx.reply('Произошла ошибка при получении данных. Пожалуйста, попробуйте позже.');
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
    `;
    
    if (stats.length > 0) {
      const totalUsers = stats[0].total_users || 0;
      const totalTokens = stats[0].total_tokens || 0;
      const completedTasks = stats[0].completed_tasks || 0;
      
      await ctx.replyWithMarkdown(
        `📊 *Статистика проекта Graphene*\n\n` +
        `👥 Всего пользователей: ${totalUsers}\n` +
        `💰 Токенов в обращении: ${totalTokens} $GRAPH\n` +
        `✅ Выполнено заданий: ${completedTasks}\n\n` +
        `🚀 Присоединяйтесь к нашему сообществу и станьте частью революции в производстве графена!`,
        Markup.inlineKeyboard([
          [Markup.button.url('🌐 Веб-сайт', 'https://graphene.com')],
          [Markup.button.url('📢 Telegram канал', 'https://t.me/graphene_channel')]
        ])
      );
    } else {
      await ctx.reply('Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.');
    }
  } catch (error) {
    console.error('Ошибка при отображении статистики:', error);
    await ctx.reply('Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.');
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
      [Markup.button.url('🌐 Веб-сайт', 'https://graphene.com')],
      [Markup.button.url('📄 Whitepaper', 'https://graphene.com/whitepaper')],
      [Markup.button.callback('💰 Токеномика', 'tokenomics')]
    ])
  );
}

// Функция отображения информации о покупке токенов
async function showBuyTokens(ctx) {
  await ctx.replyWithMarkdown(
    `🔄 *Купить токены $GRAPH*\n\n` +
    `Текущий курс: 1 SOL = 1000 $GRAPH\n\n` +
    `Для покупки токенов выберите один из способов ниже:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('💳 Купить с помощью SOL', 'buy_with_sol')],
      [Markup.button.url('🔄 Купить на DEX', 'https://raydium.io/swap/')],
      [Markup.button.callback('❓ Инструкция по покупке', 'buy_instructions')]
    ])
  );
}

// Создание сцены для подключения кошелька
function createWalletScene() {
  const scene = new Scenes.BaseScene('wallet');
  
  scene.enter(async (ctx) => {
    await ctx.reply(
      '🔑 Для подключения кошелька Solana, пожалуйста, отправьте адрес вашего кошелька (начинается с символов "sol").\n\n' +
      'Например: solABCDEF123456789...',
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_wallet')]
      ])
    );
  });
  
  scene.on(message('text'), async (ctx) => {
    const walletAddress = ctx.message.text.trim();
    
    // Простая проверка формата адреса Solana
    if (walletAddress.startsWith('sol') && walletAddress.length >= 32) {
      const userId = ctx.from.id;
      
      try {
        await sql`
          UPDATE users SET wallet_address = ${walletAddress} WHERE telegram_id = ${userId}
        `;
        
        await ctx.reply('✅ Кошелек успешно подключен! Теперь вы можете получать токены $GRAPH.');
        await ctx.scene.leave();
        await showBalance(ctx);
      } catch (error) {
        console.error('Ошибка при сохранении адреса кошелька:', error);
        await ctx.reply('❌ Произошла ошибка при сохранении адреса кошелька. Пожалуйста, попробуйте позже.');
        await ctx.scene.leave();
      }
    } else {
      await ctx.reply(
        '❌ Неверный формат адреса кошелька. Пожалуйста, убедитесь, что вы отправляете правильный адрес Solana.',
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel_wallet')]
        ])
      );
    }
  });
  
  scene.action('cancel_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('❌ Подключение кошелька отменено.');
    await ctx.scene.leave();
  });
  
  return scene;
}

// Создание сцены для эйрдропа
function createAirdropScene() {
  const scene = new Scenes.BaseScene('airdrop');
  
  scene.enter(async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      // Получаем информацию о заданиях пользователя
      const tasks = await sql`
        SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
      `;
      
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
        `;
        
        // Получаем созданные задания
        const newTasks = await sql`
          SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
        `;
        
        await showAirdropTasks(ctx, newTasks);
      } else {
        await showAirdropTasks(ctx, tasks);
      }
    } catch (error) {
      console.error('Ошибка при получении заданий эйрдропа:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке заданий эйрдропа. Пожалуйста, попробуйте позже.');
      await ctx.scene.leave();
    }
  });
  
  scene.action(/complete_task_(.+)/, async (ctx) => {
    const taskType = ctx.match[1];
    const userId = ctx.from.id;
    
    try {
      // Проверяем, выполнено ли задание
      const task = await sql`
        SELECT * FROM airdrop_tasks WHERE user_id = ${userId} AND task_type = ${taskType}
      `;
      
      if (task.length > 0 && !task[0].completed) {
        // В зависимости от типа задания выполняем разные действия
        switch (taskType) {
          case 'connect_wallet':
            await ctx.scene.leave();
            await ctx.scene.enter('wallet');
            return;
          case 'join_channel':
            await completeChannelTask(ctx, userId);
            break;
          case 'follow_twitter':
            await completeTwitterTask(ctx, userId);
            break;
          case 'invite_friend':
            await ctx.scene.leave();
            await ctx.scene.enter('referral');
            return;
          case 'complete_quiz':
            await startQuiz(ctx, userId);
            return;
          default:
            await ctx.answerCbQuery('❌ Неизвестный тип задания.');
            break;
        }
      } else {
        await ctx.answerCbQuery('✅ Это задание уже выполнено!');
      }
      
      // Обновляем список заданий
      const updatedTasks = await sql`
        SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
      `;
      
      await showAirdropTasks(ctx, updatedTasks);
    } catch (error) {
      console.error('Ошибка при выполнении задания:', error);
      await ctx.answerCbQuery('❌ Произошла ошибка при выполнении задания.');
    }
  });
  
  scene.action('exit_airdrop', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Вы вернулись в главное меню.');
    await ctx.scene.leave();
  });
  
  return scene;
}

// Функция отображения заданий эйрдропа
async function showAirdropTasks(ctx, tasks) {
  // Подсчитываем количество выполненных заданий
  const completedTasks = tasks.filter(task => task.completed).length;
  const totalTasks = tasks.length;
  const progress = Math.round((completedTasks / totalTasks) * 100);
  
  // Формируем прогресс-бар
  const progressBarLength = 10;
  const filledBlocks = Math.round((progress / 100) * progressBarLength);
  const progressBar = '▓'.repeat(filledBlocks) + '░'.repeat(progressBarLength - filledBlocks);
  
  let message = `🎁 *Эйрдроп $GRAPH токенов*\n\n` +
                `Выполните все задания и получите 100 $GRAPH токенов!\n\n` +
                `Прогресс: ${completedTasks}/${totalTasks} заданий\n` +
                `[${progressBar}] ${progress}%\n\n` +
                `*Задания:*\n`;
  
  // Формируем список заданий
  const taskButtons = [];
  
  for (const task of tasks) {
    const taskName = getTaskName(task.task_type);
    const taskStatus = task.completed ? '✅' : '⬜';
    const taskReward = getTaskReward(task.task_type);
    
    message += `${taskStatus} ${taskName} (+${taskReward} $GRAPH)\n`;
    
    if (!task.completed) {
      taskButtons.push([
        Markup.button.callback(`${taskName}`, `complete_task_${task.task_type}`)
      ]);
    }
  }
  
  // Добавляем кнопку для получения токенов, если все задания выполнены
  if (completedTasks === totalTasks) {
    message += `\n✅ Все задания выполнены! Нажмите кнопку ниже, чтобы получить ваши токены.`;
    taskButtons.push([
      Markup.button.callback('🎁 Получить 100 $GRAPH', 'claim_airdrop')
    ]);
  }
  
  // Добавляем кнопку выхода
  taskButtons.push([
    Markup.button.callback('◀️ Назад', 'exit_airdrop')
  ]);
  
  await ctx.replyWithMarkdown(
    message,
    Markup.inlineKeyboard(taskButtons)
  );
}

// Функция получения названия задания
function getTaskName(taskType) {
  switch (taskType) {
    case 'connect_wallet':
      return 'Подключить кошелек';
    case 'join_channel':
      return 'Подписаться на канал';
    case 'follow_twitter':
      return 'Подписаться на Twitter';
    case 'invite_friend':
      return 'Пригласить друга';
    case 'complete_quiz':
      return 'Пройти квиз о графене';
    default:
      return 'Неизвестное задание';
  }
}

// Функция получения награды за задание
function getTaskReward(taskType) {
  switch (taskType) {
    case 'connect_wallet':
      return 10;
    case 'join_channel':
      return 15;
    case 'follow_twitter':
      return 15;
    case 'invite_friend':
      return 30;
    case 'complete_quiz':
      return 30;
    default:
      return 0;
  }
}

// Функция выполнения задания подписки на канал
async function completeChannelTask(ctx, userId) {
  try {
    // Проверяем, подписан ли пользователь на канал
    const chatMember = await ctx.telegram.getChatMember('@graphene_channel', userId);
    
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      // Отмечаем задание как выполненное
      await sql`
        UPDATE airdrop_tasks 
        SET completed = true 
        WHERE user_id = ${userId} AND task_type = 'join_channel'
      `;
      
      await ctx.answerCbQuery('✅ Задание выполнено! +15 $GRAPH');
    } else {
      await ctx.answerCbQuery('❌ Вы не подписаны на канал. Подпишитесь и попробуйте снова.');
      
      // Отправляем ссылку на канал
      await ctx.reply(
        '📢 Для выполнения задания подпишитесь на наш официальный канал:',
        Markup.inlineKeyboard([
          [Markup.button.url('📢 Подписаться на канал', 'https://t.me/graphene_channel')]
        ])
      );
    }
  } catch (error) {
    console.error('Ошибка при проверке подписки на канал:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка при проверке подписки.');
  }
}

// Функция выполнения задания подписки на Twitter
async function completeTwitterTask(ctx, userId) {
  // В реальном боте здесь была бы интеграция с Twitter API
  // Для демонстрации просто отправляем ссылку и просим подтвердить подписку
  
  await ctx.reply(
    '🐦 Для выполнения задания подпишитесь на наш Twitter:\n\n' +
    'https://twitter.com/graphene_project\n\n' +
    'После подписки нажмите кнопку "Подтвердить".',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить подписку', 'confirm_twitter')]
    ])
  );
  
  // Обработчик подтверждения подписки
  bot.action('confirm_twitter', async (ctx) => {
    try {
      await sql`
        UPDATE airdrop_tasks 
        SET completed = true 
        WHERE user_id = ${userId} AND task_type = 'follow_twitter'
      `;
      
      await ctx.answerCbQuery('✅ Задание выполнено! +15 $GRAPH');
      
      // Обновляем список заданий
      const updatedTasks = await sql`
        SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
      `;
      
      await showAirdropTasks(ctx, updatedTasks);
    } catch (error) {
      console.error('Ошибка при выполнении задания Twitter:', error);
      await ctx.answerCbQuery('❌ Произошла ошибка при выполнении задания.');
    }
  });
}

// Функция запуска квиза
async function startQuiz(ctx, userId) {
  // Создаем сессию для квиза
  ctx.session.quiz = {
    currentQuestion: 0,
    correctAnswers: 0,
    questions: [
      {
        question: 'Что такое графен?',
        options: [
          'Трехмерная форма углерода',
          'Двумерная форма углерода толщиной в один атом',
          'Жидкая форма углерода',
          'Газообразная форма углерода'
        ],
        correctAnswer: 1
      },
      {
        question: 'Кто открыл графен?',
        options: [
          'Альберт Эйнштейн',
          'Андрей Гейм и Константин Новоселов',
          'Мария Кюри',
          'Никола Тесла'
        ],
        correctAnswer: 1
      },
      {
        question: 'Какое свойство НЕ характерно для графена?',
        options: [
          'Высокая электропроводность',
          'Высокая теплопроводность',
          'Высокая радиоактивность',
          'Высокая прочность'
        ],
        correctAnswer: 2
      }
    ]
  };
  
  // Показываем первый вопрос
  await showQuizQuestion(ctx);
}

// Функция отображения вопроса квиза
async function showQuizQuestion(ctx) {
  const quiz = ctx.session.quiz;
  const question = quiz.questions[quiz.currentQuestion];
  
  const options = question.options.map((option, index) => {
    return [Markup.button.callback(option, `quiz_answer_${index}`)]
  });
  
  await ctx.reply(
    `❓ *Вопрос ${quiz.currentQuestion + 1}/${quiz.questions.length}*\n\n` +
    `${question.question}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(options)
    }
  );
}

// Обработчики ответов на вопросы квиза
bot.action(/quiz_answer_(\d+)/, async (ctx) => {
  const answerIndex = parseInt(ctx.match[1]);
  const quiz = ctx.session.quiz;
  const userId = ctx.from.id;
  
  if (!quiz) {
    await ctx.answerCbQuery('❌ Сессия квиза истекла. Начните заново.');
    return;
  }
  
  const currentQuestion = quiz.questions[quiz.currentQuestion];
  
  // Проверяем правильность ответа
  if (answerIndex === currentQuestion.correctAnswer) {
    quiz.correctAnswers++;
    await ctx.answerCbQuery('✅ Правильно!');
  } else {
    await ctx.answerCbQuery(`❌ Неправильно. Правильный ответ: ${currentQuestion.options[currentQuestion.correctAnswer]}`);
  }
  
  // Переходим к следующему вопросу или завершаем квиз
  quiz.currentQuestion++;
  
  if (quiz.currentQuestion < quiz.questions.length) {
    await showQuizQuestion(ctx);
  } else {
    // Квиз завершен
    const passedQuiz = quiz.correctAnswers >= Math.ceil(quiz.questions.length / 2);
    
    if (passedQuiz) {
      try {
        // Отмечаем задание как выполненное
        await sql`
          UPDATE airdrop_tasks 
          SET completed = true 
          WHERE user_id = ${userId} AND task_type = 'complete_quiz'
        `;
        
        await ctx.reply(
          `🎉 Квиз завершен!\n\n` +
          `Правильных ответов: ${quiz.correctAnswers}/${quiz.questions.length}\n\n` +
          `✅ Вы успешно прошли квиз и получили +30 $GRAPH!`
        );
      } catch (error) {
        console.error('Ошибка при выполнении задания квиза:', error);
        await ctx.reply('❌ Произошла ошибка при сохранении результатов квиза.');
      }
    } else {
      await ctx.reply(
        `❌ Квиз завершен!\n\n` +
        `Правильных ответов: ${quiz.correctAnswers}/${quiz.questions.length}\n\n` +
        `Для выполнения задания необходимо правильно ответить минимум на ${Math.ceil(quiz.questions.length / 2)} вопроса. Попробуйте еще раз!`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Пройти квиз заново', 'restart_quiz')]
        ])
      );
    }
    
    // Очищаем сессию квиза
    delete ctx.session.quiz;
    
    // Возвращаемся к списку заданий
    const updatedTasks = await sql`
      SELECT * FROM airdrop_tasks WHERE user_id = ${userId}
    `;
    
    await showAirdropTasks(ctx, updatedTasks);
  }
});

// Обработчик перезапуска квиза
bot.action('restart_quiz', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await startQuiz(ctx, userId);
});

// Создание сцены для реферальной системы
function createReferralScene() {
  const scene = new Scenes.BaseScene('referral');
  
  scene.enter(async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      // Получаем информацию о пользователе и его рефералах
      const user = await sql`
        SELECT referral_code FROM users WHERE telegram_id = ${userId}
      `;
      
      const referrals = await sql`
        SELECT COUNT(*) as count FROM users WHERE referred_by = ${userId}
      `;
      
      const referralCount = referrals[0]?.count || 0;
      const referralCode = user[0]?.referral_code || generateReferralCode(userId);
      const referralLink = `https://t.me/graphene_bot?start=${referralCode}`;
      
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
          [Markup.button.callback('📋 Скопировать ссылку', 'copy_referral_link')],
          [Markup.button.url('📱 Поделиться в Telegram', `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Присоединяйся к Graphene и получи бесплатные токены $GRAPH!')}`)],
          [Markup.button.callback('◀️ Назад', 'exit_referral')]
        ])
      );
      
      // Если это задание эйрдропа, отмечаем его как выполненное
      await sql`
        UPDATE airdrop_tasks 
        SET completed = true 
        WHERE user_id = ${userId} AND task_type = 'invite_friend'
      `;
    } catch (error) {
      console.error('Ошибка при получении данных о рефералах:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке реферальной программы. Пожалуйста, попробуйте позже.');
      await ctx.scene.leave();
    }
  });
  
  scene.action('copy_referral_link', async (ctx) => {
    await ctx.answerCbQuery('✅ Ссылка скопирована в буфер обмена!');
  });
  
  scene.action('exit_referral', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Вы вернулись в главное меню.');
    await ctx.scene.leave();
  });
  
  return scene;
}

// Обработчик команды /start с реферальным кодом
bot.hears(/\/start (.+)/, async (ctx) => {
  const referralCode = ctx.match[1];
  const userId = ctx.from.id;
  
  try {
    // Проверяем, существует ли пользователь с таким реферальным кодом
    const referrer = await sql`
      SELECT telegram_id FROM users WHERE referral_code = ${referralCode}
    `;
    
    if (referrer.length > 0 && referrer[0].telegram_id !== userId) {
      const referrerId = referrer[0].telegram_id;
      
      // Проверяем, не был ли пользователь уже приглашен
      const user = await sql`
        SELECT referred_by FROM users WHERE telegram_id = ${userId}
      `;
      
      if (user.length > 0 && !user[0].referred_by) {
        // Обновляем информацию о пользователе
        await sql`
          UPDATE users SET referred_by = ${referrerId} WHERE telegram_id = ${userId}
        `;
        
        // Начисляем токены рефереру
        await sql`
          UPDATE users SET balance = balance + 30 WHERE telegram_id = ${referrerId}
        `;
        
        // Уведомляем реферера
        await ctx.telegram.sendMessage(
          referrerId,
          `🎉 Поздравляем! По вашей реферальной ссылке зарегистрировался новый пользователь. Вам начислено 30 $GRAPH!`
        );
        
        await ctx.reply('✅ Вы успешно присоединились по реферальной ссылке!');
      }
    }
  } catch (error) {
    console.error('Ошибка при обработке реферальной ссылки:', error);
  }
  
  // Продолжаем стандартную обработку команды /start
  await registerUser(ctx);
  await ctx.reply(
    `👋 Привет, ${ctx.from.first_name}! Добро пожаловать в официальный бот проекта Graphene.\n\n` +
    `Graphene — это токенизированная Web3-платформа для масштабного производства графена на блокчейне Solana.`,
    Markup.keyboard([
      ['💰 Баланс', '🎁 Эйрдроп'],
      ['👥 Рефералы', '📊 Статистика'],
      ['ℹ️ О проекте', '🔄 Купить токены']
    ]).resize()
  );
});

// Обработчик получения токенов эйрдропа
bot.action('claim_airdrop', async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    // Проверяем, выполнены ли все задания
    const tasks = await sql`
      SELECT COUNT(*) as total, SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed
      FROM airdrop_tasks WHERE user_id = ${userId}
    `;
    
    if (tasks[0].total === tasks[0].completed) {
      // Проверяем, получал ли пользователь уже токены
      const airdropClaimed = await sql`
        SELECT airdrop_claimed FROM users WHERE telegram_id = ${userId}
      `;
      
      if (!airdropClaimed[0].airdrop_claimed) {
        // Начисляем токены
        await sql`
          UPDATE users SET balance = balance + 100, airdrop_claimed = true WHERE telegram_id = ${userId}
        `;
        
        await ctx.answerCbQuery('🎉 Поздравляем! Вы получили 100 $GRAPH токенов!');
        await ctx.reply(
          '🎉 *Поздравляем!*\n\n' +
          'Вы успешно выполнили все задания эйрдропа и получили 100 $GRAPH токенов!\n\n' +
          'Токены уже зачислены на ваш баланс. Вы можете проверить их в разделе "Баланс".',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💰 Проверить баланс', 'check_balance')]
            ])
          }
        );
      } else {
        await ctx.answerCbQuery('❌ Вы уже получили токены за эйрдроп.');
      }
    } else {
      await ctx.answerCbQuery('❌ Для получения токенов необходимо выполнить все задания.');
    }
  } catch (error) {
    console.error('Ошибка при получении токенов эйрдропа:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка при получении токенов.');
  }
});

// Обработчик проверки баланса
bot.action('check_balance', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.leave();
  await showBalance(ctx);
});

// Обработчик обновления баланса
bot.action('refresh_balance', async (ctx) => {
  await ctx.answerCbQuery('🔄 Баланс обновлен');
  await showBalance(ctx);
});

// Обработчик подключения кошелька
bot.action('connect_wallet', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('wallet');
});

// Обработчик информации о токеномике
bot.action('tokenomics', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    `💰 *Токеномика $GRAPH*\n\n` +
    `Общее предложение: 100,000,000 $GRAPH\n\n` +
    `*Распределение токенов:*\n` +
    `- Продажа токенов: 30%\n` +
    `- Команда и советники: 15%\n` +
    `- Маркетинг: 10%\n` +
    `- Эйрдропы и реферальная система: 20%\n` +
    `- Резерв экосистемы: 15%\n` +
    `- Ликвидность: 10%\n\n` +
    `*Utility токена:*\n` +
    `- Управление: участие в голосованиях по развитию проекта\n` +
    `- Доступ к продукции: приоритетный доступ к графеновой продукции\n` +
    `- Стейкинг: получение пассивного дохода\n` +
    `- NFT и геймификация: доступ к эксклюзивным NFT и игровым механикам`,
    Markup.inlineKeyboard([
      [Markup.button.callback('◀️ Назад', 'back_to_about')]
    ])
  );
});

// Обработчик возврата к информации о проекте
bot.action('back_to_about', async (ctx) => {
  await ctx.answerCbQuery();
  await showAbout(ctx);
});

// Обработчик покупки с помощью SOL
bot.action('buy_with_sol', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    `💳 *Покупка токенов с помощью SOL*\n\n` +
    `Для покупки токенов $GRAPH отправьте SOL на следующий адрес:\n\n` +
    `\`solABCDEF123456789...\`\n\n` +
    `После отправки SOL, токены $GRAPH будут автоматически зачислены на ваш баланс в соотношении 1 SOL = 1000 $GRAPH.\n\n` +
    `Минимальная сумма покупки: 0.1 SOL`,
    Markup.inlineKeyboard([
      [Markup.button.callback('◀️ Назад', 'back_to_buy')]
    ])
  );
});

// Обработчик инструкции по покупке
bot.action('buy_instructions', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    `❓ *Инструкция по покупке токенов $GRAPH*\n\n` +
    `1. *Через бота (SOL):*\n` +
    `   - Выберите "Купить с помощью SOL"\n` +
    `   - Отправьте SOL на указанный адрес\n` +
    `   - Получите токены $GRAPH на свой баланс\n\n` +
    `2. *Через DEX (Raydium):*\n` +
    `   - Перейдите на Raydium.io\n` +
    `   - Подключите кошелек Solana\n` +
    `   - Найдите пару $GRAPH/SOL\n` +
    `   - Укажите количество SOL для обмена\n` +
    `   - Подтвердите транзакцию\n\n` +
    `Если у вас возникли вопросы, обратитесь в поддержку: @graphene_support`,
    Markup.inlineKeyboard([
      [Markup.button.callback('◀️ Назад', 'back_to_buy')]
    ])
  );
});

// Обработчик возврата к покупке токенов
bot.action('back_to_buy', async (ctx) => {
  await ctx.answerCbQuery();
  await showBuyTokens(ctx);
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}`, err);
  ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже или обратитесь в поддержку.');
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот запущен!');
}).catch(err => {
  console.error('Ошибка при запуске бота:', err);
});

// Включаем graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
