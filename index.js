require("dotenv").config()

const fs = require("fs")
const axios = require("axios")
const { Telegraf, Markup } = require("telegraf")

const bot = new Telegraf(process.env.TOKEN)

const apiKey = process.env.PAKASIR_KEY
const project = process.env.PROJECT
const owner = process.env.OWNER_ID

const Banner_Video = {
    source: fs.createReadStream("./menu.mp4")
}

const transaksi = {}

function runtime(seconds) {
    seconds = Number(seconds)

    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor(seconds % (3600 * 24) / 3600)
    const m = Math.floor(seconds % 3600 / 60)
    const s = Math.floor(seconds % 60)

    return `${d} Hari ${h} Jam ${m} Menit ${s} Detik`
}

bot.start(async (ctx) => {

    const teks = `
Halo ${ctx.from.first_name}

Bot aktif.
Tekan tombol di bawah.
`

    await ctx.reply(
        teks,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "📋 Menu",
                    "menu"
                )
            ]
        ])
    )
})

bot.action("menu", async (ctx) => {

    try {

        const tanggal = new Date().toLocaleString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })

        const teks = `
╭━━━〔 REYCLOUD PAYMENT 〕━━━⬣
┃ 👤 User : ${ctx.from.first_name}
┃ 🤖 Versi : 2.5
┃ 📅 Tanggal : ${tanggal}
┃ ⏰ Runtime : ${runtime(process.uptime())}
┃ 👑 Creator : ReyCloudDev
╰━━━━━━━━━━━━━━━━━━⬣

Pilih menu di bawah.
`

        await ctx.replyWithVideo(
            Banner_Video,
            {
                caption: teks,
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "💳 Create QRIS",
                            "buat_qris"
                        )
                    ],
                    [
                        Markup.button.url(
                            "📢 Channel",
                            "https://t.me/AboutReyZ4You"
                        ),
                        Markup.button.url(
                            "👑 Owner",
                            "https://t.me/ReyCloudDev"
                        )
                    ]
                ])
            }
        )

        ctx.answerCbQuery()

    } catch (err) {

        console.log(err)

        ctx.reply(
            "Gagal membuka menu."
        )
    }
})

bot.action("buat_qris", async (ctx) => {

    ctx.answerCbQuery()

    ctx.reply(
        `
Ketik nominal:

Contoh:
<code>/qris 1000</code>
`,
        {
            parse_mode: "HTML"
        }
    )
})

bot.command("qris", async (ctx) => {

    try {

        const args = ctx.message.text.split(" ")

        const amount = parseInt(args[1])

        if (!amount) {

            return ctx.reply(
                "Contoh:\n/qris 1000"
            )
        }

        const orderId = "INV" + Date.now()

        const response = await axios.post(
            "https://app.pakasir.com/api/transactioncreate/qris",
            {
                project,
                order_id: orderId,
                amount,
                api_key: apiKey
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        )

        const pay = response.data.payment

        transaksi[orderId] = {
            amount: pay.amount,
            status: "pending",
            chatId: ctx.chat.id
        }

        const qrUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pay.payment_number)}`

        const caption = `
╭━━〔 QRIS PAYMENT 〕━━⬣
┃ 🧾 Order ID : ${pay.order_id}
┃ 💰 Amount : Rp${pay.amount}
┃ 💸 Fee : Rp${pay.fee}
┃ 🪙 Total : Rp${pay.total_payment}
┃ 📊 Status : Pending
┃ ⏳ Expired : ${pay.expired_at}
╰━━━━━━━━━━━━━━⬣

Silahkan scan QRIS di atas.
`

        await ctx.replyWithPhoto(
            {
                url: qrUrl
            },
            {
                caption,
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "❌ Cancel",
                            `cancel_${orderId}`
                        )
                    ]
                ])
            }
        )

        const interval = setInterval(async () => {

            try {

                const cek = await axios.get(
                    "https://app.pakasir.com/api/transactiondetail",
                    {
                        params: {
                            project,
                            amount: pay.amount,
                            order_id: orderId,
                            api_key: apiKey
                        }
                    }
                )

                const trx = cek.data.transaction

                if (trx.status === "completed") {

                    clearInterval(interval)

                    transaksi[orderId].status =
                        "completed"

                    await bot.telegram.sendMessage(
                        ctx.chat.id,
                        `
✅ DEPOSIT BERHASIL

🧾 Order ID : ${trx.order_id}
💰 Amount : Rp${trx.amount}
📊 Status : ${trx.status}
`
                    )

                    await bot.telegram.sendMessage(
                        owner,
                        `
🚨 PAYMENT MASUK

👤 User : ${ctx.from.first_name}
🆔 User ID : ${ctx.from.id}

🧾 Order ID : ${trx.order_id}
💰 Amount : Rp${trx.amount}
📊 Status : ${trx.status}

🕒 ${new Date().toLocaleString("id-ID")}
`
                    )
                }

                if (trx.status === "cancelled") {

                    clearInterval(interval)

                    transaksi[orderId].status =
                        "cancelled"
                }

            } catch (err) {

                console.log(err.message)
            }

        }, 10000)

    } catch (err) {

        console.log(
            err.response?.data || err.message
        )

        ctx.reply(
            "Gagal membuat QRIS."
        )
    }
})

bot.action(/cancel_(.+)/, async (ctx) => {

    try {

        const orderId = ctx.match[1]

        if (!transaksi[orderId]) {

            return ctx.answerCbQuery(
                "Order tidak ditemukan."
            )
        }

        const amount =
            transaksi[orderId].amount

        await axios.post(
            "https://app.pakasir.com/api/transactioncancel",
            {
                project,
                order_id: orderId,
                amount,
                api_key: apiKey
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        )

        transaksi[orderId].status =
            "cancelled"

        await ctx.editMessageCaption(
            `
❌ TRANSAKSI DIBATALKAN

🧾 Order ID : ${orderId}
💰 Amount : Rp${amount}
`
        )

        ctx.answerCbQuery(
            "Transaksi dibatalkan."
        )

    } catch (err) {

        console.log(
            err.response?.data || err.message
        )

        ctx.answerCbQuery(
            "Gagal cancel transaksi."
        )
    }
})

bot.catch((err) => {
    console.log("BOT ERROR:", err)
})

bot.telegram.deleteWebhook()

bot.launch(() => {
    console.log("Bot aktif")
})

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))