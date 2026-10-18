require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    SlashCommandBuilder,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    UserSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================================================
// CONFIGURATION
// ============================================================

const SLASH_COMMANDS = [
    new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Modifier les grades d’un membre sans lui envoyer de message.')
        .addStringOption(option =>
            option.setName('id').setDescription('ID Discord ou mention du membre à promouvoir.').setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('grade-actuel').setDescription('Grade à remplacer ou à conserver.').setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('nouveau-grade').setDescription('Grade à ajouter au membre.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode').setDescription('Remplacer le grade actuel ou ajouter le nouveau grade.').setRequired(true)
                .addChoices(
                    { name: 'Remplacer le grade actuel', value: 'remplacer' },
                    { name: 'Ajouter sans supprimer le grade actuel', value: 'ajouter' }
                )
        ),
    new SlashCommandBuilder()
        .setName('env-form-rc')
        .setDescription('Envoyer le formulaire de recrutement dans un salon.')
        .addChannelOption(option =>
            option.setName('salon').setDescription('Salon où publier le formulaire.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('env-form-chgd')
        .setDescription('Envoyer le formulaire de changement de grade dans un salon.')
        .addChannelOption(option =>
            option.setName('salon').setDescription('Salon où publier le formulaire.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('event')
        .setDescription('Définir le cooldown événementiel en minutes.')
        .addIntegerOption(option =>
            option.setName('minutes').setDescription('Cooldown à appliquer dans les salons publicitaires.').setMinValue(1).setMaxValue(360).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('reset-event')
        .setDescription('Restaurer les cooldowns par défaut configurés pour les salons publicitaires.'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Afficher les commandes disponibles.'),
    new SlashCommandBuilder()
        .setName('config')
        .setDescription('Ouvrir la configuration interactive du serveur.'),
    new SlashCommandBuilder()
        .setName('message-boutique')
        .setDescription('Publier le message de la boutique.'),
    new SlashCommandBuilder()
        .setName('panel-dmdrank')
        .setDescription('Alias de /env-form-chgd.')
        .addChannelOption(option =>
            option.setName('salon').setDescription('Salon où publier le formulaire.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('panel-recrutement')
        .setDescription('Alias de /env-form-rc.')
        .addChannelOption(option =>
            option.setName('salon').setDescription('Salon où publier le formulaire.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('panel-recrutemtent')
        .setDescription('Ancien alias de /env-form-rc.')
        .addChannelOption(option =>
            option.setName('salon').setDescription('Salon où publier le formulaire.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('staff-stat')
        .setDescription('Afficher les statistiques du staff.'),
    new SlashCommandBuilder()
        .setName('partenariat')
        .setDescription('Gérer les partenariats.')
        .addSubcommand(subcommand =>
            subcommand.setName('send').setDescription('Ouvrir le formulaire de création d’un partenariat.')
        ),
    new SlashCommandBuilder()
        .setName('stats-pub')
        .setDescription('Afficher les statistiques de vérification des publicités.'),
    new SlashCommandBuilder()
        .setName('statspub')
        .setDescription('Ancien alias de /stats-pub.')
].map(command => command.setDefaultMemberPermissions(null).toJSON());

const CONFIG_FILE = path.join(__dirname, 'ultrapub-config.json');
const DEFAULT_GUILD_CONFIG = {
    roleByCommand: {},
    messages: {},
    defaultCooldowns: {},
    promotionLogChannelId: null,
    staffRoleId: null
};
const guildConfig = {};

function getGuildConfig(guildId) {
    if (!guildConfig[guildId]) {
        guildConfig[guildId] = {
            roleByCommand: {},
            messages: {},
            defaultCooldowns: {},
            promotionLogChannelId: null,
            staffRoleId: null
        };
    }

    return guildConfig[guildId];
}

function loadGuildConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

            for (const [guildId, config] of Object.entries(loaded)) {
                guildConfig[guildId] = {
                    ...DEFAULT_GUILD_CONFIG,
                    ...config,
                    roleByCommand: config.roleByCommand || {},
                    messages: config.messages || {},
                    defaultCooldowns: config.defaultCooldowns || {},
                    promotionLogChannelId: config.promotionLogChannelId || null,
                    staffRoleId: config.staffRoleId || null
                };
            }
        }
    } catch (error) {
        console.error('❌ Impossible de lire ultrapub-config.json :', error);
    }
}

function saveGuildConfig() {
    try {
        const tmp = `${CONFIG_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(guildConfig, null, 2));
        fs.renameSync(tmp, CONFIG_FILE);
    } catch (error) {
        console.error('❌ Impossible d’écrire ultrapub-config.json :', error);
    }
}

loadGuildConfig();

const ACCESS_CONTROL_COMMANDS = SLASH_COMMANDS
    .map(command => command.name)
    .filter(name => name !== 'config');

function hasCommandAccess(interaction, member) {
    if (
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        member?.permissions.has(PermissionFlagsBits.Administrator)
    ) {
        return true;
    }

    const allowedRoleId =
        getGuildConfig(interaction.guildId).roleByCommand[interaction.commandName];

    return Boolean(
        allowedRoleId &&
        member?.roles.cache.has(allowedRoleId)
    );
}

const LOG_CHANNEL_ID = '1547692905240723578';
const AVIS_CHANNEL_ID = '1548258506182754324';
const RANK_REQUEST_CHANNEL_ID = '1553838874701070416';

// Système de publicités
const PUB_CATEGORY_ID = '1546253326620950638';
const PUB_MOD_CHANNEL_ID = '1546254557946843209';
const PUB_LOG_CHANNEL_ID = '1546254612087185498';
const PUB_SANCTION_CHANNEL_ID = '1546255154855018607';

// Système de partenariats
const PARTENARIAT_CHANNEL_ID = '1546270218584592565';
const PARTENAIRE_ROLE_ID = '1546250483793002596';
const NOTIF_PARTENARIAT_ROLE_ID = '1546941873485254716';

// Grades autorisés
const ALLOWED_RANKS = [
    'Modo',
    'Community Manager',
    'Créa/Dev'
];

// ============================================================
// DONNÉES TEMPORAIRES
// ============================================================

const partnershipData = new Map();
const pubStatsHistory = [];
const staffStats = new Map();
const voiceSessions = new Map();

// Sessions de candidatures
const recruitmentData = new Map();

// ============================================================
// SYSTÈME ÉVÉNEMENT (COOLDOWN 1 MINUTE SUR LA CATÉGORIE PUB)
// ============================================================

const EVENT_COOLDOWN_SECONDS = 60;
const EVENT_FILE = path.join(__dirname, 'event-cooldowns.json');

// active  : true si l'événement est en cours
// saved   : { idSalon: cooldownOriginalEnSecondes }
let eventState = {
    active: false,
    saved: {},
    cooldownSeconds: EVENT_COOLDOWN_SECONDS
};

function loadEventState() {
    try {
        if (fs.existsSync(EVENT_FILE)) {
            const data = JSON.parse(fs.readFileSync(EVENT_FILE, 'utf8'));
            eventState = {
                active: Boolean(data.active),
                saved: data.saved && typeof data.saved === 'object' ? data.saved : {},
                cooldownSeconds: Number.isInteger(data.cooldownSeconds)
                    ? data.cooldownSeconds
                    : EVENT_COOLDOWN_SECONDS
            };
        }
    } catch (error) {
        console.error('❌ Impossible de lire event-cooldowns.json :', error);
    }
}

function saveEventState() {
    try {
        const tmp = `${EVENT_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(eventState, null, 2));
        fs.renameSync(tmp, EVENT_FILE);
    } catch (error) {
        console.error('❌ Impossible d’écrire event-cooldowns.json :', error);
    }
}

loadEventState();

function getPubCategoryTextChannels(guild) {
    return guild.channels.cache.filter(
        channel =>
            channel.parentId === PUB_CATEGORY_ID &&
            channel.type === ChannelType.GuildText
    );
}

// ============================================================
// FORMULAIRES DE RECRUTEMENT
// ============================================================

const recruitmentForms = {

    // ========================================================
    // GRAPHISTE / DÉVELOPPEUR
    // ========================================================

    graphdev: {
        name: 'Graphiste / Développeur',
        shortTitle: 'Candidature — Graphiste / Dev',

        description:
            'Tu souhaites rejoindre l’équipe d’Ultra Pub en tant que graphiste ou développeur ? Remplis ce formulaire sérieusement. 🛠️',

        questions: [
            {
                id: 'q1',
                label: 'Pseudo Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton pseudo Discord'
            },
            {
                id: 'q2',
                label: 'Identifiant Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton identifiant Discord'
            },
            {
                id: 'q3',
                label: 'Poste souhaité',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Graphiste / Développeur / Les deux'
            },
            {
                id: 'q4',
                label: 'Ton âge',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ex : 15'
            },
            {
                id: 'q5',
                label: 'Tes compétences',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Présente tes principales compétences...'
            },
            {
                id: 'q6',
                label: 'Depuis combien de temps pratiques-tu ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Ex : 2 ans'
            },
            {
                id: 'q7',
                label: 'Logiciels / langages maîtrisés',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Ex : Photoshop, Canva, JavaScript, Python...'
            },
            {
                id: 'q8',
                label: 'Déjà travaillé pour un serveur/projet ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Oui / Non'
            },
            {
                id: 'q9',
                label: 'Présente tes réalisations',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Liens ou présentation de tes réalisations...'
            },
            {
                id: 'q10',
                label: 'Temps consacré à Ultra Pub',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Combien de temps peux-tu consacrer au serveur ?'
            },
            {
                id: 'q11',
                label: 'Pourquoi rejoindre Ultra Pub ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Explique tes motivations...'
            },
            {
                id: 'q12',
                label: 'Quelque chose à ajouter ?',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Une dernière information ?'
            }
        ]
    },

    // ========================================================
    // MODÉRATEUR
    // ========================================================

    modo: {
        name: 'Modérateur',
        shortTitle: 'Candidature — Modérateur',

        description:
            'Tu veux rejoindre l’équipe de modération d’Ultra Pub ? Présente-nous ton profil et tes motivations. 🛡️',

        questions: [
            {
                id: 'q1',
                label: 'Pseudo Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton pseudo Discord'
            },
            {
                id: 'q2',
                label: 'Identifiant Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton identifiant Discord'
            },
            {
                id: 'q3',
                label: 'Ton âge',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ex : 15'
            },
            {
                id: 'q4',
                label: 'Déjà été modérateur ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Oui / Non'
            },
            {
                id: 'q5',
                label: 'Si oui, sur quel(s) serveur(s) ?',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Indique les serveurs concernés...'
            },
            {
                id: 'q6',
                label: 'Quelles sont tes qualités ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Présente tes qualités...'
            },
            {
                id: 'q7',
                label: 'Réaction face à un membre',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder:
                    'Comment réagirais-tu face à un membre qui ne respecte pas le règlement ?'
            },
            {
                id: 'q8',
                label: 'Staff qui enfreint les règles',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Que ferais-tu dans cette situation ?'
            },
            {
                id: 'q9',
                label: 'Es-tu disponible régulièrement ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Oui / Non'
            },
            {
                id: 'q10',
                label: 'Temps consacré au serveur',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Combien de temps par jour/semaine ?'
            },
            {
                id: 'q11',
                label: 'Pourquoi devenir modérateur ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Explique tes motivations...'
            },
            {
                id: 'q12',
                label: 'Pourquoi devrions-nous te choisir ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Présente tes points forts...'
            },
            {
                id: 'q13',
                label: 'Quelque chose à ajouter ?',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Une dernière information ?'
            }
        ]
    },

    // ========================================================
    // COMMUNITY MANAGER
    // ========================================================

    cm: {
        name: 'Community Manager',
        shortTitle: 'Candidature — Community Manager',

        description:
            'Tu aimes discuter, trouver des partenaires et développer une communauté ? Le poste de Community Manager est fait pour toi ! 🤝',

        questions: [
            {
                id: 'q1',
                label: 'Pseudo Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton pseudo Discord'
            },
            {
                id: 'q2',
                label: 'Identifiant Discord',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ton identifiant Discord'
            },
            {
                id: 'q3',
                label: 'Ton âge',
                style: TextInputStyle.Short,
                required: true,
                placeholder: 'Ex : 15'
            },
            {
                id: 'q4',
                label: 'Déjà été Community Manager ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Oui / Non'
            },
            {
                id: 'q5',
                label: 'Si oui, explique ton expérience',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Présente ton expérience...'
            },
            {
                id: 'q6',
                label: 'Comment trouver de nouveaux partenaires ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Explique ta méthode...'
            },
            {
                id: 'q7',
                label: 'Comment contacter un serveur ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder:
                    'Explique comment tu proposerais un partenariat...'
            },
            {
                id: 'q8',
                label: 'Entretenir une bonne relation',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder:
                    'Comment garder une bonne relation avec nos partenaires ?'
            },
            {
                id: 'q9',
                label: 'À l’aise pour contacter des inconnus ?',
                style: TextInputStyle.Short,
                required: false,
                placeholder: 'Oui / Non'
            },
            {
                id: 'q10',
                label: 'Temps consacré à Ultra Pub',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder:
                    'Combien de temps peux-tu consacrer au serveur ?'
            },
            {
                id: 'q11',
                label: 'Pourquoi rejoindre le pôle Partenariats ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Explique tes motivations...'
            },
            {
                id: 'q12',
                label: 'Pourquoi devrions-nous te choisir ?',
                style: TextInputStyle.Paragraph,
                required: true,
                placeholder: 'Présente tes points forts...'
            },
            {
                id: 'q13',
                label: 'Idées pour développer les partenariats',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder:
                    'Tes idées pour développer les partenariats...'
            },
            {
                id: 'q14',
                label: 'Quelque chose à ajouter ?',
                style: TextInputStyle.Paragraph,
                required: false,
                placeholder: 'Une dernière information ?'
            }
        ]
    }
};

// ============================================================
// OUTILS
// ============================================================

function getStaffStats(userId) {
    if (!staffStats.has(userId)) {
        staffStats.set(userId, {
            messages: 0,
            partnerships: 0,
            pubsVerified: 0,
            voiceSeconds: 0
        });
    }

    return staffStats.get(userId);
}

function formatDuration(seconds) {
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours} h ${minutes} min`;
    }

    return `${minutes} min`;
}

function truncate(text, maxLength = 1900) {
    const value = String(text ?? '');

    if (value.length <= maxLength) {
        return value;
    }

    return value.slice(0, maxLength - 3) + '...';
}

async function fetchTextChannel(guild, channelId) {
    if (!guild) return null;

    const channel = await guild.channels
        .fetch(channelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    return channel;
}

async function safeSendDM(user, payload) {
    try {
        await user.send(payload);
        return true;
    } catch (error) {
        console.warn(
            `Impossible d'envoyer un MP à ${user.id}:`,
            error.message
        );

        return false;
    }
}

function createRankDecisionRow(userId, requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `rank_approve_${userId}_${requestId}`
            )
            .setLabel('Valider')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),

        new ButtonBuilder()
            .setCustomId(
                `rank_reject_${userId}_${requestId}`
            )
            .setLabel('Refuser')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
}

// ============================================================
// CONSTRUCTION D'UNE MODALE DE RECRUTEMENT
// ============================================================

function buildRecruitmentModal(poste, step) {
    const form = recruitmentForms[poste];

    if (!form) {
        throw new Error(
            `Formulaire de recrutement inconnu : ${poste}`
        );
    }

    const maxPerStep = 5;

    const start =
        (step - 1) * maxPerStep;

    const questions =
        form.questions.slice(
            start,
            start + maxPerStep
        );

    const totalSteps =
        Math.ceil(
            form.questions.length / maxPerStep
        );

    const modal =
        new ModalBuilder()
            .setCustomId(
                `recrutement_modal_${poste}_${step}`
            )
            .setTitle(
                `${form.shortTitle} • ${step}/${totalSteps}`
            );

    for (const question of questions) {

        const input =
            new TextInputBuilder()
                .setCustomId(
                    question.id
                )
                .setLabel(
                    question.label.slice(
                        0,
                        45
                    )
                )
                .setStyle(
                    question.style
                )
                .setRequired(
                    question.required
                )
                .setMaxLength(
                    question.style ===
                        TextInputStyle.Paragraph
                        ? 1000
                        : 300
                );

        if (question.placeholder) {
            input.setPlaceholder(
                question.placeholder.slice(
                    0,
                    100
                )
            );
        }

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                input
            )
        );
    }

    return modal;
}

// ============================================================
// ENVOI DE LA CANDIDATURE
// ============================================================

async function submitRecruitmentApplication(
    interaction,
    session
) {

    const form =
        recruitmentForms[
            session.poste
        ];

    if (!form) {
        throw new Error(
            'Formulaire de recrutement introuvable.'
        );
    }

    let targetChannel = null;

    // Si l'interaction vient d'un serveur
    if (interaction.guild) {
        targetChannel =
            await fetchTextChannel(
                interaction.guild,
                AVIS_CHANNEL_ID
            );
    }

    // Si l'interaction vient des MP,
    // recherche dans les serveurs du bot.
    if (!targetChannel) {
        for (
            const guild
            of client.guilds.cache.values()
        ) {
            targetChannel =
                await fetchTextChannel(
                    guild,
                    AVIS_CHANNEL_ID
                );

            if (targetChannel) {
                break;
            }
        }
    }

    if (!targetChannel) {
        throw new Error(
            'Salon de réception des candidatures introuvable.'
        );
    }

    // ========================================================
    // CRÉATION DES CHAMPS
    // ========================================================

    const fields =
        form.questions.map(
            question => ({
                name: question.label,

                value: truncate(
                    session.answers[
                        question.id
                    ] ||
                    'Non renseigné',
                    950
                ),

                inline: false
            })
        );

    // ========================================================
    // GROUPES DE 5 CHAMPS
    // ========================================================

    const embedGroups = [];

    for (
        let i = 0;
        i < fields.length;
        i += 5
    ) {
        embedGroups.push(
            fields.slice(
                i,
                i + 5
            )
        );
    }

    const embeds =
        embedGroups.map(
            (group, index) => {

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            '#5865F2'
                        )
                        .addFields(
                            group
                        )
                        .setFooter({
                            text:
                                `Ultra Pub • Candidature ${index + 1}/${embedGroups.length}`
                        })
                        .setTimestamp();

                if (index === 0) {

                    embed
                        .setTitle(
                            `📋 Candidature — ${form.name}`
                        )
                        .setDescription(
                            `**Candidat :** ${interaction.user}\n` +
                            `**Identifiant :** \`${interaction.user.id}\`\n` +
                            `**Poste :** ${form.name}`
                        )
                        .setThumbnail(
                            interaction.user.displayAvatarURL()
                        );
                }

                return embed;
            }
        );

    // ========================================================
    // MESSAGE DE CANDIDATURE
    // ========================================================

    const applicationMessage =
        await targetChannel.send({

            content:
                `📋 **Nouvelle candidature !**\n` +
                `👤 Candidat : <@${interaction.user.id}>\n` +
                `💼 Poste : **${form.name}**`,

            embeds,

            allowedMentions: {
                users: [
                    interaction.user.id
                ]
            }
        });

    // ========================================================
    // THREAD
    // ========================================================

    const thread =
        await applicationMessage.startThread({
            name: 'Réponse Candid',
            autoArchiveDuration: 1440,
            reason:
                'Thread de décision pour une candidature Ultra Pub'
        });

    await thread.send({

        content:
            `📋 **Avis sur la candidature de <@${interaction.user.id}>**\n\n` +
            `Poste demandé : **${form.name}**\n\n` +
            `Le sondage ci-dessous permet au staff de voter sur l'acceptation de la candidature.`,

        allowedMentions: {
            users: [
                interaction.user.id
            ]
        }
    });

    // ========================================================
    // SONDAGE NATIF DISCORD
    // ========================================================

    await thread.send({

        poll: {

            question: {
                text:
                    `Candidature de ${interaction.user.username} — Acceptée ?`
            },

            answers: [
                { text: 'Oui', emoji: '✅' },
                { text: 'Non', emoji: '❌' },
                { text: 'Blanc', emoji: '⚪' }
            ],

            duration: 24,

            allowMultiselect: false
        }
    });
}

// ============================================================
// READY
// ============================================================

client.once(
    'clientReady',
    async () => {

        console.log(
            '===================================='
        );

        console.log(
            `🤖 Ultra Pub connecté : ${client.user.tag}`
        );

        console.log(
            `🆔 ID : ${client.user.id}`
        );

        console.log(
            `🏠 Serveurs : ${client.guilds.cache.size}`
        );

        console.log(
            '===================================='
        );

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            try {
                const registeredCommands =
                    await guild.commands.fetch();

                const obsoleteEventCommand =
                    registeredCommands.find(command => command.name === 'event-1m');

                if (obsoleteEventCommand) {
                    await obsoleteEventCommand.delete();
                }

                for (const commandData of SLASH_COMMANDS) {
                    const existingCommand =
                        registeredCommands.find(
                            command => command.name === commandData.name
                        );

                    if (existingCommand) {
                        await existingCommand.edit(commandData);
                    } else {
                        await guild.commands.create(commandData);
                    }
                }
            } catch (error) {
                console.error(
                    `⚠️ Enregistrement des commandes impossible (${guild.name}) :`,
                    error
                );
            }

            await guild.members
                .fetch()
                .catch(error => {

                    console.error(
                        `⚠️ Chargement des membres impossible (${guild.name}) :`,
                        error
                    );

                });
        }
    }
);

// ============================================================
// STATISTIQUES VOCALES
// ============================================================

client.on(
    'voiceStateUpdate',
    (oldState, newState) => {

        try {

            const member =
                newState.member ||
                oldState.member;

            if (
                !member ||
                member.user.bot
            ) {
                return;
            }

            const userId =
                member.id;

            const wasInVoice =
                Boolean(
                    oldState.channelId
                );

            const isInVoice =
                Boolean(
                    newState.channelId
                );

            if (
                !wasInVoice &&
                isInVoice
            ) {

                voiceSessions.set(
                    userId,
                    Date.now()
                );

                return;
            }

            if (
                wasInVoice &&
                !isInVoice
            ) {

                const startedAt =
                    voiceSessions.get(
                        userId
                    );

                if (startedAt) {

                    const elapsedSeconds =
                        Math.floor(
                            (
                                Date.now() -
                                startedAt
                            ) / 1000
                        );

                    getStaffStats(
                        userId
                    ).voiceSeconds +=
                        Math.max(
                            0,
                            elapsedSeconds
                        );

                    voiceSessions.delete(
                        userId
                    );
                }

                return;
            }

            if (
                wasInVoice &&
                isInVoice &&
                !voiceSessions.has(
                    userId
                )
            ) {

                voiceSessions.set(
                    userId,
                    Date.now()
                );
            }

        } catch (error) {

            console.error(
                'Erreur voiceStateUpdate :',
                error
            );
        }
    }
);

// ============================================================
// MESSAGE CREATE
// ============================================================

const handleMessageCreate = async message => {

        try {

            if (
                !message.guild ||
                message.author.bot
            ) {
                return;
            }

            // ====================================================
            // STATISTIQUES STAFF
            // ====================================================

            if (!message.__slashCommand) {
                getStaffStats(
                    message.author.id
                ).messages++;
            }

            // ====================================================
            // PUBLICITÉS
            // ====================================================

            if (
                !message.__slashCommand &&
                message.channel.parentId ===
                PUB_CATEGORY_ID
            ) {

                await message.reply({
                    content:
                        getGuildConfig(message.guild.id).messages.pub ||
                        'Merci de poster votre publicité ! Assure-toi qu’elle respecte les **Règles de Discord** et le **Règlement d’Ultra Pub**.'
                }).catch(error => {

                    console.error(
                        'Erreur de réponse à une publicité :',
                        error
                    );

                });

                const modChannel =
                    await fetchTextChannel(
                        message.guild,
                        PUB_MOD_CHANNEL_ID
                    );

                if (modChannel) {

                    const timestamp =
                        Math.floor(
                            message.createdTimestamp /
                            1000
                        );

                    const infoEmbed =
                        new EmbedBuilder()
                            .setColor(
                                '#FF0000'
                            )
                            .setDescription(
                                `🪧 **Informations :**\n` +
                                `**Auteur :** <@${message.author.id}> • ${message.author.username}\n` +
                                `**Salon :** <#${message.channel.id}>\n\n` +
                                `📍 Identifiant publicitaire : \`${message.author.id}\`\n` +
                                `🕒 <t:${timestamp}:R>`
                            );

                    const row1 =
                        new ActionRowBuilder()
                            .addComponents(

                                new ButtonBuilder()
                                    .setCustomId(
                                        `pub_accept_${message.id}_${message.channel.id}_${message.author.id}`
                                    )
                                    .setLabel(
                                        'Accepter'
                                    )
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                                    .setEmoji(
                                        '🟢'
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        `pub_sanction_${message.id}_${message.channel.id}_${message.author.id}`
                                    )
                                    .setLabel(
                                        'Sanctionner'
                                    )
                                    .setStyle(
                                        ButtonStyle.Primary
                                    )
                                    .setEmoji(
                                        '❗'
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        `pub_refuse_${message.id}_${message.channel.id}_${message.author.id}`
                                    )
                                    .setLabel(
                                        'Refuser'
                                    )
                                    .setStyle(
                                        ButtonStyle.Danger
                                    )
                                    .setEmoji(
                                        '🛑'
                                    )
                            );

                    const row2 =
                        new ActionRowBuilder()
                            .addComponents(

                                new ButtonBuilder()
                                    .setLabel(
                                        'Message original'
                                    )
                                    .setStyle(
                                        ButtonStyle.Link
                                    )
                                    .setURL(
                                        message.url
                                    )
                                    .setEmoji(
                                        '💬'
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        `pub_help_${message.id}`
                                    )
                                    .setLabel(
                                        "Besoin d'aide"
                                    )
                                    .setStyle(
                                        ButtonStyle.Secondary
                                    )
                                    .setEmoji(
                                        '❓'
                                    )
                            );

                    await modChannel.send({

                        content:
                            truncate(
                                message.content ||
                                '*Publicité avec contenu multimédia*',
                                1900
                            ),

                        embeds: [
                            infoEmbed
                        ],

                        components: [
                            row1,
                            row2
                        ],

                        allowedMentions: {
                            parse: []
                        }

                    }).catch(error => {

                        console.error(
                            'Erreur envoi publicité au staff :',
                            error
                        );

                    });
                }
            }

            // ====================================================
            // COMMANDES
            // ====================================================

            if (!message.__slashCommand) {
                return;
            }

            const { commandName, args } = message.__slashCommand;

            if (!commandName) {
                return;
            }

            const executor =
                message.member ||
                await message.guild.members
                    .fetch(
                        message.author.id
                    )
                    .catch(
                        () => null
                    );

            // ====================================================
            // ÉVÉNEMENT : COOLDOWN PERSONNALISABLE
            // ====================================================

            if (
                commandName === 'event' ||
                commandName === 'reset-event'
            ) {

                if (
                    !hasCommandAccess(message.__slashCommand.interaction, executor)
                ) {

                    return message.reply(
                        '❌ Tu n’as pas la permission d’utiliser cette commande.'
                    );
                }

                await message.guild.channels.fetch().catch(() => null);

                const channels =
                    getPubCategoryTextChannels(
                        message.guild
                    );

                if (channels.size === 0) {

                    return message.reply(
                        '❌ Aucun salon textuel trouvé dans la catégorie des publicités.'
                    );
                }

                const isReset = commandName === 'reset-event';
                const status = await message.reply(
                    isReset
                        ? '⏳ Restauration des cooldowns par défaut...'
                        : `⏳ Application du cooldown événementiel de **${message.__slashCommand.minutes} minute(s)**...`
                );
                const config = getGuildConfig(message.guild.id);
                let success = 0;
                let failed = 0;

                if (!isReset && !eventState.active) {
                    eventState.saved = {};
                    for (const channel of channels.values()) {
                        eventState.saved[channel.id] = channel.rateLimitPerUser || 0;
                    }
                }

                if (!isReset) {
                    eventState.active = true;
                    eventState.cooldownSeconds = message.__slashCommand.minutes * 60;
                }

                for (const channel of channels.values()) {
                    const cooldown = isReset
                        ? Number(config.defaultCooldowns[channel.id] ?? eventState.saved[channel.id] ?? 0)
                        : eventState.cooldownSeconds;

                    try {
                        await channel.setRateLimitPerUser(
                            cooldown,
                            isReset ? 'Restauration du cooldown par défaut' : 'Cooldown événementiel'
                        );
                        success++;
                    } catch (error) {
                        failed++;
                        console.error(
                            `❌ Event : impossible de modifier #${channel.name} :`,
                            error.message
                        );
                    }
                }

                if (isReset) {
                    eventState.active = false;
                    eventState.saved = {};
                    eventState.cooldownSeconds = EVENT_COOLDOWN_SECONDS;
                }
                saveEventState();

                return status.edit(
                    `${isReset ? '✅ Cooldowns par défaut restaurés' : '🎉 Événement activé'} sur **${success}** salons` +
                    (failed ? ` (${failed} échec(s), voir la console)` : '') +
                    '.'
                );
            }

            // ====================================================
            // MESSAGE BOUTIQUE
            // ====================================================

            if (
                commandName ===
                'message-boutique'
            ) {

                const boutiqueMessage =
`# 🛒 BOUTIQUE ULTRA PUB

Tu souhaites donner plus de visibilités à ton serveur, ton projet ou ta communauté ?
Retrouve ici toutes nos offres et options disponibles.

━━━━━━━━━━━━━━━━━━

🏠・SALON PERSO

Crée ton propre salon sur Ultra Pub pour présenter ton projet et le rendre visible auprès de la communauté.

⏱️・Durées

📅 3 mois — 3,50 €
📅 6 mois — 6,00 €
📅 1 an — 10,00 €
♾️ À vie — 45,00 €

📣・Options

📢 Mention Here — +1,00 €
📣 Mention Everyone — +2,00 €
👻 Ghost Ping — 0,20 €/jour

━━━━━━━━━━━━━━━━━━

📩・PUB EN MP

Fais connaître ton projet directement dans les messages privés des membres.

⏱️・Durées

📅 1 mois — 3,00 €
📅 2 mois — 5,50 €
📅 6 mois — 10,00 €
📅 1 an — 25,00 €
♾️ À vie — 50,00 €

━━━━━━━━━━━━━━━━━━

💎・VIP

Obtiens le rôle VIP et profite des avantages réservés aux membres VIP.

💎 5,00 €/mois

━━━━━━━━━━━━━━━━━━

📦・PACKS

🐀・PACK RAT

🏠 Salon perso — 3 mois
📢 Mention Here
📩 Pub en MP

💰 5,00 €

⸻

🚀・PACK BOOST PUB

🏠 Salon perso — 6 mois
📢 Mention Here
📣 Mention Everyone
📩 Pub en MP — 2 mois

💰 12,00 €

━━━━━━━━━━━━━━━━━━

👻・GHOST PING

Le Ghost Ping est une option disponible lors de la création d’un salon perso.

💰 0,20 €/jour

📅 7 jours → 1,40 €
📅 30 jours → 6,00 €
📅 90 jours → 18,00 €
📅 1 an → 73,00 €

━━━━━━━━━━━━━━━━━━

💰・À QUOI SERT L’ARGENT ?

L’argent récolté grâce à la boutique sert directement au développement et au fonctionnement d’Ultra Pub.

Il peut notamment servir à :

🛠️ Financer les bots, services et outils
🎁 Organiser des giveaways et événements
📈 Développer et améliorer le serveur
💻 Payer différents frais liés au serveur

Notre objectif est que l’argent généré par la boutique puisse servir à faire évoluer Ultra Pub et à remercier les personnes qui s’investissent dans le serveur. ❤️

━━━━━━━━━━━━━━━━━━

🎫・UNE OFFRE T’INTÉRESSE ?

Ouvre un ticket dans la boutique et indique simplement l’offre que tu souhaites commander.

📢 Merci de soutenir Ultra Pub ! 🚀`;

                const chunks = [];
                let current = '';

                for (
                    const line
                    of boutiqueMessage.split('\n')
                ) {

                    const addition =
                        `${line}\n`;

                    if (
                        current.length +
                        addition.length >
                        1900
                    ) {

                        if (
                            current.trim()
                        ) {
                            chunks.push(
                                current.trim()
                            );
                        }

                        current = '';
                    }

                    if (
                        addition.length >
                        1900
                    ) {

                        for (
                            let i = 0;
                            i < addition.length;
                            i += 1900
                        ) {

                            chunks.push(
                                addition.slice(
                                    i,
                                    i + 1900
                                )
                            );
                        }

                    } else {

                        current += addition;
                    }
                }

                if (
                    current.trim()
                ) {
                    chunks.push(
                        current.trim()
                    );
                }

                for (
                    const chunk
                    of chunks
                ) {

                    await message.channel.send({
                        content: chunk,

                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                return;
            }

            // ====================================================
            // PANEL DMD RANK
            // ====================================================

            if (
                commandName === 'env-form-chgd' ||
                commandName === 'panel-dmdrank'
            ) {

                if (
                    !hasCommandAccess(message.__slashCommand.interaction, executor)
                ) {

                    return message.reply(
                        '❌ Tu n’as pas la permission d’utiliser cette commande.'
                    );
                }

                const panelEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            '📋 Demande de changement de grade'
                        )
                        .setColor(
                            '#5865F2'
                        )
                        .setDescription(
                            getGuildConfig(message.guild.id).messages['changement-grade'] ||
                            'Tu souhaites demander un changement de grade dans le staff ?\n\n' +
                            'Ce formulaire concerne uniquement les grades suivants :\n' +
                            '• **Modo**\n' +
                            '• **Community Manager**\n' +
                            '• **Créa/Dev**\n\n' +
                            'Les grades de test et les variantes de grade ne sont pas concernés.\n\n' +
                            'Clique sur le bouton ci-dessous pour envoyer ta demande. ' +
                            'Elle sera étudiée par l’administration.'
                        )
                        .setFooter({
                            text:
                                'Ultra Pub • Gestion du staff'
                        })
                        .setTimestamp();

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    'rank_open_form'
                                )
                                .setLabel(
                                    'Faire une demande'
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                )
                                .setEmoji(
                                    '📝'
                                )
                        );

                await message.channel.send({
                    embeds: [
                        panelEmbed
                    ],
                    components: [
                        row
                    ]
                });

                return;
            }

            // ====================================================
            // PANEL RECRUTEMENT
            // ====================================================

            if (
                    commandName === 'env-form-rc' ||
                    commandName === 'panel-recrutemtent' ||
                    commandName === 'panel-recrutement'
            ) {

                if (
                    !hasCommandAccess(message.__slashCommand.interaction, executor)
                ) {

                    return message.reply(
                        '❌ Tu n’as pas la permission d’utiliser cette commande.'
                    );
                }

                const recruitmentEmbed =
                    new EmbedBuilder()
                        .setColor(
                            '#5865F2'
                        )
                        .setTitle(
                            '📋・RECRUTEMENT — ULTRA PUB'
                        )
                        .setDescription(
                            getGuildConfig(message.guild.id).messages.recrutement ||
                            'Ultra Pub ouvre actuellement plusieurs postes au sein de son équipe.\n\n' +

                            'Nous recherchons des personnes sérieuses, motivées et disponibles, souhaitant s’investir durablement dans le développement du serveur.\n\n' +

                            '🤝 **Community Manager**\n\n' +
                            'Chargé du développement et de la gestion des partenariats.\n\n' +

                            '🛡️ **Modérateur**\n\n' +
                            'Chargé de veiller au respect du règlement et au bon fonctionnement du serveur.\n\n' +

                            '🎨💻 **Développeur / Graphiste**\n\n' +
                            'Participe à la création, l’amélioration et au développement des différents projets d’Ultra Pub.\n\n' +

                            'Chaque candidature sera étudiée par la direction d’Ultra Pub.\n' +
                            'Merci de remplir le formulaire correspondant au poste souhaité avec des informations sérieuses et précises.'
                        )
                        .setFooter({
                            text:
                                'Ultra Pub • Recrutement'
                        })
                        .setTimestamp();

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    'recrutement_start'
                                )
                                .setLabel(
                                    'Obtenir le formulaire'
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                )
                                .setEmoji(
                                    '📋'
                                )
                        );

                await message.channel.send({
                    embeds: [
                        recruitmentEmbed
                    ],
                    components: [
                        row
                    ]
                });

                return;
            }

            // ====================================================
            // STAFF STAT
            // ====================================================

            if (
                commandName ===
                'staff-stat'
            ) {

                await message.guild.members.fetch().catch(() => null);

                const staffRoleId =
                    getGuildConfig(message.guild.id).staffRoleId;
                const staffRole = staffRoleId
                    ? message.guild.roles.cache.get(staffRoleId)
                    : null;
                const staffMembers = staffRole
                    ? message.guild.members.cache.filter(
                        member => member.roles.cache.has(staffRole.id)
                    )
                    : [];
                const staffLines = staffRole
                    ? [...staffMembers.values()].map(
                        member => `• ${member.displayName} (@${member.user.username})`
                    )
                    : [];
                const staffChunks = [];
                let currentStaffChunk = '';

                for (const line of staffLines) {
                    if (currentStaffChunk.length + line.length + 1 > 1800) {
                        staffChunks.push(currentStaffChunk);
                        currentStaffChunk = '';
                    }

                    currentStaffChunk += `${currentStaffChunk ? '\n' : ''}${line}`;
                }

                if (currentStaffChunk) {
                    staffChunks.push(currentStaffChunk);
                }

                const stats =
                    getStaffStats(
                        message.author.id
                    );

                let voiceSeconds =
                    stats.voiceSeconds;

                const activeVoiceStart =
                    voiceSessions.get(
                        message.author.id
                    );

                if (
                    activeVoiceStart
                ) {

                    voiceSeconds +=
                        Math.floor(
                            (
                                Date.now() -
                                activeVoiceStart
                            ) / 1000
                        );
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📊 Rapport d’activité du staff'
                        )
                        .setColor(
                            '#5865F2'
                        )
                        .setThumbnail(
                            message.author.displayAvatarURL()
                        )
                        .setDescription(
                            `**Membre :** ${message.author}\n` +
                            `**Période :** Depuis le dernier redémarrage du bot`
                        )
                        .addFields(
                            {
                                name: staffRole
                                    ? `👥 Staff Ultra Pub (${staffMembers.size})`
                                    : '👥 Staff Ultra Pub',
                                value: staffRole
                                    ? staffMembers.size
                                        ? 'Liste complète envoyée ci-dessous.'
                                        : '*Aucun membre ne possède ce rôle.*'
                                    : '*Configure le rôle Staff Ultra Pub dans `/config`.*',
                                inline: false
                            },
                            {
                                name:
                                    '🤝 Partenariats effectués',
                                value:
                                    `**${stats.partnerships}**`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '💬 Messages envoyés',
                                value:
                                    `**${stats.messages}**`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '🎙️ Temps en vocal',
                                value:
                                    `**${formatDuration(voiceSeconds)}**`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '🛡️ Publicités vérifiées',
                                value:
                                    `**${stats.pubsVerified}**`,
                                inline:
                                    true
                            }
                        )
                        .setFooter({
                            text:
                                'Ultra Pub • Statistiques du staff'
                        })
                        .setTimestamp();

                const report = await message.channel.send({
                    embeds: [
                        embed
                    ]
                });

                for (const [index, chunk] of staffChunks.entries()) {
                    await message.channel.send({
                        content: `${index === 0 ? `👥 **Staff Ultra Pub (${staffMembers.size})**\n` : ''}${chunk}`,
                        allowedMentions: { parse: [] }
                    });
                }

                return report;
            }

            // ====================================================
            // PARTENARIAT SEND
            // ====================================================

            if (
                commandName ===
                    'partenariat' &&
                args[0]?.toLowerCase() ===
                    'send'
            ) {

                if (
                    !hasCommandAccess(message.__slashCommand.interaction, executor)
                ) {

                    return message.reply(
                        '❌ Tu n’as pas la permission d’utiliser cette commande.'
                    );
                }

                const mentionSelect =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            'partenariat_select_mention'
                        )
                        .setPlaceholder(
                            'Choisis une mention'
                        )
                        .addOptions(
                            {
                                label:
                                    '@everyone',
                                value:
                                    'everyone',
                                description:
                                    'Mentionner tout le serveur'
                            },
                            {
                                label:
                                    '@here',
                                value:
                                    'here',
                                description:
                                    'Mentionner les membres en ligne'
                            },
                            {
                                label:
                                    '@Partenariat',
                                value:
                                    'role_partenariat',
                                description:
                                    'Mentionner le rôle de notification partenariat'
                            }
                        );

                const userSelect =
                    new UserSelectMenuBuilder()
                        .setCustomId(
                            'partenariat_select_partner'
                        )
                        .setPlaceholder(
                            'Choisis le partenaire'
                        );

                const button =
                    new ButtonBuilder()
                        .setCustomId(
                            'partenariat_btn_open_modal'
                        )
                        .setLabel(
                            'Rédiger la description / pub'
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        );

                if (
                    message.deletable
                ) {

                    await message
                        .delete()
                        .catch(
                            () => null
                        );
                }

                return message.channel.send({

                    content:
                        '📌 **Menu de création de partenariat**\n' +
                        'Sélectionne la mention et le partenaire, puis clique sur le bouton pour rédiger la publicité.',

                    components: [

                        new ActionRowBuilder()
                            .addComponents(
                                mentionSelect
                            ),

                        new ActionRowBuilder()
                            .addComponents(
                                userSelect
                            ),

                        new ActionRowBuilder()
                            .addComponents(
                                button
                            )
                    ]
                });
            }

            // ====================================================
            // STATS PUB
            // ====================================================

            if (
                commandName ===
                    'stats-pub' ||
                commandName ===
                    'statspub'
            ) {

                if (
                    !hasCommandAccess(message.__slashCommand.interaction, executor)
                ) {

                    return message.reply(
                        '❌ Tu n’as pas la permission d’exécuter cette commande.'
                    );
                }

                const oneWeekAgo =
                    Date.now() -
                    7 *
                    24 *
                    60 *
                    60 *
                    1000;

                const recent =
                    pubStatsHistory.filter(
                        entry =>
                            entry.timestamp >=
                            oneWeekAgo
                    );

                const counts = {};

                for (
                    const entry
                    of recent
                ) {

                    counts[
                        entry.staffId
                    ] =
                        (
                            counts[
                                entry.staffId
                            ] ||
                            0
                        ) + 1;
                }

                const top =
                    Object.entries(
                        counts
                    )
                        .sort(
                            (a, b) =>
                                b[1] -
                                a[1]
                        )
                        .slice(
                            0,
                            5
                        );

                const topText =
                    top.length

                        ? top
                            .map(
                                (
                                    [
                                        id,
                                        count
                                    ],
                                    index
                                ) =>
                                    `**#${index + 1}** <@${id}> — **${count}** vérification(s)`
                            )
                            .join('\n')

                        : '*Aucune vérification enregistrée cette semaine.*';

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📊 Statistiques des vérifications de pubs'
                        )
                        .setColor(
                            '#3498DB'
                        )
                        .addFields(
                            {
                                name:
                                    '📥 Total des vérifications (7 jours)',
                                value:
                                    `**${recent.length}**`,
                                inline:
                                    false
                            },
                            {
                                name:
                                    '🏆 Top modérateurs',
                                value:
                                    topText,
                                inline:
                                    false
                            }
                        )
                        .setTimestamp();

                return message.channel.send({
                    embeds: [
                        embed
                    ]
                });
            }

        } catch (error) {

            console.error(
                '❌ Erreur messageCreate :',
                error
            );

            if (message.__slashCommand) {
                await message.__slashCommand.interaction.editReply({
                    content: '❌ Une erreur est survenue pendant l’exécution de la commande.'
                }).catch(() => null);
            }
        }
};

client.on(
    'messageCreate',
    handleMessageCreate
);

// ============================================================
// SALON CRÉÉ PENDANT L'ÉVÉNEMENT
// ============================================================

client.on(
    'channelCreate',
    async channel => {

        try {

            if (
                !eventState.active ||
                channel.parentId !== PUB_CATEGORY_ID ||
                channel.type !== ChannelType.GuildText
            ) {
                return;
            }

            eventState.saved[channel.id] =
                channel.rateLimitPerUser || 0;

            saveEventState();

            await channel.setRateLimitPerUser(
                eventState.cooldownSeconds,
                'Événement : cooldown configuré'
            );

        } catch (error) {

            console.error(
                '❌ Erreur channelCreate (événement) :',
                error
            );
        }
    }
);

// ============================================================
// INTERACTIONS
// ============================================================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId.startsWith('config_')
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.customId === 'config_action') {
                    const action = interaction.values[0];

                    if (action === 'acces') {
                        const commandMenu = new StringSelectMenuBuilder()
                            .setCustomId('config_access_command')
                            .setPlaceholder('Choisir une commande')
                            .addOptions(ACCESS_CONTROL_COMMANDS.map(name => ({
                                label: `/${name}`,
                                value: name
                            })));

                        return interaction.update({
                            content: 'Choisis la commande à autoriser à un rôle :',
                            components: [new ActionRowBuilder().addComponents(commandMenu)]
                        });
                    }

                    if (action === 'cooldown') {
                        const channelMenu = new ChannelSelectMenuBuilder()
                            .setCustomId('config_cooldown_channel')
                            .setPlaceholder('Choisir un salon publicitaire')
                            .setChannelTypes(ChannelType.GuildText);

                        return interaction.update({
                            content: 'Choisis le salon publicitaire à configurer :',
                            components: [new ActionRowBuilder().addComponents(channelMenu)]
                        });
                    }

                    if (action === 'promotion-channel') {
                        const channelMenu = new ChannelSelectMenuBuilder()
                            .setCustomId('config_promotion_log_channel')
                            .setPlaceholder('Choisir le salon du journal des promotions')
                            .setChannelTypes(ChannelType.GuildText);

                        return interaction.update({
                            content: 'Choisis le salon où publier les promotions :',
                            components: [new ActionRowBuilder().addComponents(channelMenu)]
                        });
                    }

                    if (action === 'staff-role') {
                        const roleMenu = new RoleSelectMenuBuilder()
                            .setCustomId('config_staff_role')
                            .setPlaceholder('Choisir le rôle Staff Ultra Pub')
                            .setMinValues(1)
                            .setMaxValues(1);

                        return interaction.update({
                            content: 'Choisis le rôle qui identifie les membres du staff :',
                            components: [new ActionRowBuilder().addComponents(roleMenu)]
                        });
                    }

                    const messageMenu = new StringSelectMenuBuilder()
                        .setCustomId('config_message_type')
                        .setPlaceholder('Choisir le message à personnaliser')
                        .addOptions(
                            { label: 'Vérification des publicités', value: 'pub' },
                            { label: 'Formulaire de recrutement', value: 'recrutement' },
                            { label: 'Formulaire de changement de grade', value: 'changement-grade' }
                        );

                    return interaction.update({
                        content: 'Choisis le message à personnaliser :',
                        components: [new ActionRowBuilder().addComponents(messageMenu)]
                    });
                }

                if (interaction.customId === 'config_access_command') {
                    const commandName = interaction.values[0];
                    const roleMenu = new RoleSelectMenuBuilder()
                        .setCustomId(`config_access_role:${commandName}`)
                        .setPlaceholder('Choisir le rôle autorisé')
                        .setMinValues(1)
                        .setMaxValues(1);
                    const clearButton = new ButtonBuilder()
                        .setCustomId(`config_access_clear:${commandName}`)
                        .setLabel('Retirer l’exception')
                        .setStyle(ButtonStyle.Secondary);

                    return interaction.update({
                        content: `Choisis le rôle qui pourra utiliser **/${commandName}** sans être administrateur :`,
                        components: [
                            new ActionRowBuilder().addComponents(roleMenu),
                            new ActionRowBuilder().addComponents(clearButton)
                        ]
                    });
                }

                if (interaction.customId === 'config_message_type') {
                    const messageType = interaction.values[0];
                    const input = new TextInputBuilder()
                        .setCustomId('message')
                        .setLabel('Texte du message')
                        .setStyle(TextInputStyle.Paragraph)
                        .setMaxLength(1000)
                        .setRequired(true);

                    return interaction.showModal(
                        new ModalBuilder()
                            .setCustomId(`config_message:${messageType}`)
                            .setTitle('Personnaliser un message')
                            .addComponents(new ActionRowBuilder().addComponents(input))
                    );
                }

                return;
            }

            if (
                interaction.isRoleSelectMenu() &&
                interaction.customId.startsWith('config_access_role:')
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const commandName = interaction.customId.split(':')[1];
                getGuildConfig(interaction.guildId).roleByCommand[commandName] = interaction.values[0];
                saveGuildConfig();

                return interaction.update({
                    content: `✅ Le rôle <@&${interaction.values[0]}> peut maintenant utiliser **/${commandName}**.`,
                    components: []
                });
            }

            if (
                interaction.isRoleSelectMenu() &&
                interaction.customId === 'config_staff_role'
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                getGuildConfig(interaction.guildId).staffRoleId = interaction.values[0];
                saveGuildConfig();

                return interaction.update({
                    content: `✅ Le rôle Staff Ultra Pub est maintenant <@&${interaction.values[0]}>.`,
                    components: []
                });
            }

            if (
                interaction.isChannelSelectMenu() &&
                [
                    'config_cooldown_channel',
                    'config_promotion_log_channel'
                ].includes(interaction.customId)
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const channelId = interaction.values[0];
                const channel = interaction.guild.channels.cache.get(channelId);

                if (interaction.customId === 'config_promotion_log_channel') {
                    if (!channel?.isTextBased()) {
                        return interaction.update({
                            content: '❌ Choisis un salon textuel valide.',
                            components: []
                        });
                    }

                    getGuildConfig(interaction.guildId).promotionLogChannelId = channelId;
                    saveGuildConfig();

                    return interaction.update({
                        content: `✅ Le journal des promotions sera publié dans <#${channelId}>.`,
                        components: []
                    });
                }

                if (channel?.parentId !== PUB_CATEGORY_ID) {
                    return interaction.update({
                        content: '❌ Ce salon ne se trouve pas dans la catégorie des publicités.',
                        components: []
                    });
                }

                const input = new TextInputBuilder()
                    .setCustomId('minutes')
                    .setLabel('Cooldown par défaut en minutes (0 à 360)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(3)
                    .setRequired(true);

                return interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(`config_cooldown:${channelId}`)
                        .setTitle('Cooldown par défaut')
                        .addComponents(new ActionRowBuilder().addComponents(input))
                );
            }

            if (
                interaction.isButton() &&
                interaction.customId.startsWith('config_access_clear:')
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const commandName = interaction.customId.split(':')[1];
                delete getGuildConfig(interaction.guildId).roleByCommand[commandName];
                saveGuildConfig();

                return interaction.update({
                    content: `✅ L’accès à **/${commandName}** est de nouveau réservé aux administrateurs.`,
                    components: []
                });
            }

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith('config_')
            ) {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({
                        content: '❌ Seuls les administrateurs peuvent modifier la configuration.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.customId.startsWith('config_cooldown:')) {
                    const channelId = interaction.customId.split(':')[1];
                    const minutes = Number(interaction.fields.getTextInputValue('minutes'));

                    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 360) {
                        return interaction.reply({
                            content: '❌ Indique un nombre entier entre 0 et 360 minutes.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    getGuildConfig(interaction.guildId).defaultCooldowns[channelId] = minutes * 60;
                    saveGuildConfig();

                    return interaction.reply({
                        content: `✅ Le cooldown par défaut de <#${channelId}> est réglé sur **${minutes} minute(s)**.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.customId.startsWith('config_message:')) {
                    const messageType = interaction.customId.split(':')[1];
                    const message = interaction.fields.getTextInputValue('message').trim();
                    getGuildConfig(interaction.guildId).messages[messageType] = message;
                    saveGuildConfig();

                    return interaction.reply({
                        content: '✅ Le message a été enregistré.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            if (interaction.isChatInputCommand()) {

                if (
                    !SLASH_COMMANDS.some(
                        command => command.name === interaction.commandName
                    )
                ) {
                    return;
                }

                if (!interaction.guild) {
                    return interaction.reply({
                        content: '❌ Cette commande doit être utilisée sur un serveur.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const member = await interaction.guild.members
                    .fetch(interaction.user.id)
                    .catch(() => null);
                const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

                if (
                    (interaction.commandName === 'config' && !isAdmin) ||
                    (interaction.commandName !== 'config' && !hasCommandAccess(interaction, member))
                ) {
                    return interaction.reply({
                        content: '❌ Cette commande est réservée aux administrateurs ou au rôle autorisé dans /config.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.commandName === 'config') {
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId('config_action')
                        .setPlaceholder('Choisir un réglage')
                        .addOptions(
                            { label: 'Accès aux commandes', value: 'acces' },
                            { label: 'Cooldowns par défaut', value: 'cooldown' },
                            { label: 'Messages personnalisés', value: 'message' },
                            { label: 'Salon du journal des promotions', value: 'promotion-channel' },
                            { label: 'Rôle Staff Ultra Pub', value: 'staff-role' }
                        );

                    return interaction.reply({
                        content: '⚙️ **Configuration du serveur**',
                        components: [new ActionRowBuilder().addComponents(menu)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.commandName === 'help') {
                    return interaction.reply({
                        content: [
                            '**Commandes Ultra Pub**',
                            '`/promotion` : modifier les grades d’un membre.',
                            '`/env-form-rc` et `/env-form-chgd` : publier les formulaires.',
                            '`/event minutes` et `/reset-event` : gérer les cooldowns événementiels.',
                            '`/config` : configurer les rôles autorisés, les messages et les cooldowns.',
                            '`/message-boutique`, `/partenariat send`, `/staff-stat`, `/stats-pub`.'
                        ].join('\n'),
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.commandName === 'promotion') {
                    const rawId = interaction.options.getString('id').trim();
                    const memberId = rawId.match(/^<@!?(\d+)>$/)?.[1] || rawId;
                    const target = /^\d+$/.test(memberId)
                        ? await interaction.guild.members.fetch(memberId).catch(() => null)
                        : null;
                    const currentRole = interaction.options.getRole('grade-actuel');
                    const newRole = interaction.options.getRole('nouveau-grade');
                    const mode = interaction.options.getString('mode');
                    const botMember = interaction.guild.members.me;
                    const promotionLogChannelId =
                        getGuildConfig(interaction.guild.id).promotionLogChannelId;
                    const promotionLogChannel = promotionLogChannelId
                        ? await interaction.guild.channels.fetch(promotionLogChannelId).catch(() => null)
                        : null;

                    if (!target) {
                        return interaction.reply({
                            content: '❌ ID ou mention de membre invalide.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (!promotionLogChannel?.isTextBased()) {
                        return interaction.reply({
                            content: '❌ Configure d’abord le salon du journal des promotions dans `/config`.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (
                        !botMember ||
                        !promotionLogChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)
                    ) {
                        return interaction.reply({
                            content: '❌ Le bot ne peut pas écrire dans le salon configuré pour les promotions.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (
                        !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
                        !target.manageable ||
                        !currentRole.editable ||
                        !newRole.editable ||
                        currentRole.id === interaction.guild.id
                    ) {
                        return interaction.reply({
                            content: '❌ Le bot ne peut pas gérer ce membre ou ces rôles. Vérifie sa permission **Gérer les rôles** et la hiérarchie des rôles.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    try {
                        if (mode === 'remplacer' && target.roles.cache.has(currentRole.id)) {
                            await target.roles.remove(currentRole);
                        }
                        await target.roles.add(newRole);

                        const removedGrade = mode === 'remplacer'
                            ? `<@&${currentRole.id}>`
                            : 'Aucun (grade actuel conservé)';
                        const logSent = await promotionLogChannel.send({
                            content:
                                `> Pseudo Discord : ${target.user.username} (<@${target.id}>)\n` +
                                `> Grade à mettre : <@&${newRole.id}>\n` +
                                `> Grade à enlever : ${removedGrade}`,
                            allowedMentions: {
                                users: [target.id],
                                roles: mode === 'remplacer'
                                    ? [currentRole.id, newRole.id]
                                    : [newRole.id]
                            }
                        }).then(() => true).catch(error => {
                            console.error('Erreur envoi du journal /promotion :', error);
                            return false;
                        });

                        return interaction.reply({
                            content: `✅ Rôle **${newRole.name}** ${mode === 'remplacer' ? 'attribué à la place de' : 'ajouté à'} <@${target.id}>.` +
                                (logSent ? '' : ' ⚠️ Le journal n’a pas pu être envoyé dans le salon configuré.'),
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (error) {
                        console.error('Erreur /promotion :', error);
                        return interaction.reply({
                            content: '❌ Impossible de modifier les rôles de ce membre.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                const interactionChannel = interaction.channel;
                const usesTargetChannel = [
                    'env-form-rc',
                    'env-form-chgd',
                    'panel-recrutement',
                    'panel-recrutemtent',
                    'panel-dmdrank'
                ].includes(interaction.commandName);
                const commandChannel = usesTargetChannel
                    ? interaction.options.getChannel('salon')
                    : interactionChannel;

                if (!commandChannel) {
                    return interaction.reply({
                        content: '❌ Salon cible introuvable.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const commandArgs =
                    interaction.commandName === 'partenariat' &&
                    interaction.options.getSubcommand(false) === 'send'
                        ? ['send']
                        : [];

                await handleMessageCreate({
                    __slashCommand: {
                        interaction,
                        commandName: interaction.commandName,
                        args: commandArgs,
                        minutes: interaction.options.getInteger('minutes')
                    },
                    guild: interaction.guild,
                    member: member || {
                        permissions: interaction.memberPermissions
                    },
                    author: interaction.user,
                    channel: commandChannel,
                    deletable: false,
                    reply: (...args) => interaction.editReply(...args)
                });

                if (!interaction.replied) {
                    await interaction.editReply('✅ Commande exécutée.');
                }

                return;
            }

            // ====================================================
            // RECRUTEMENT — BOUTON PRINCIPAL
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    'recrutement_start'
            ) {

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            'recrutement_select_poste'
                        )
                        .setPlaceholder(
                            'Choisis le poste pour lequel tu candidates'
                        )
                        .addOptions(
                            {
                                label:
                                    'Community Manager',
                                value:
                                    'cm',
                                description:
                                    'Développement et gestion des partenariats',
                                emoji:
                                    '🤝'
                            },
                            {
                                label:
                                    'Modérateur',
                                value:
                                    'modo',
                                description:
                                    'Modération et bon fonctionnement du serveur',
                                emoji:
                                    '🛡️'
                            },
                            {
                                label:
                                    'Graphiste / Développeur',
                                value:
                                    'graphdev',
                                description:
                                    'Création graphique et développement',
                                emoji:
                                    '🎨'
                            }
                        );

                return interaction.reply({

                    content:
                        '📋 **Choisis le poste pour lequel tu souhaites candidater.**\n\n' +
                        'Le formulaire sera ensuite envoyé directement en MP.',

                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                menu
                            )
                    ],

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ====================================================
            // RECRUTEMENT — CHOIX DU POSTE
            // ====================================================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId ===
                    'recrutement_select_poste'
            ) {

                const poste =
                    interaction.values[0];

                const form =
                    recruitmentForms[
                        poste
                    ];

                if (!form) {

                    return interaction.reply({

                        content:
                            '❌ Ce formulaire de recrutement est introuvable.',

                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                // IMPORTANT :
                // On répond immédiatement à l'interaction.
                // Cela évite le "Unknown interaction".
                await interaction.deferUpdate();

                recruitmentData.set(
                    interaction.user.id,
                    {
                        poste,
                        answers: {},
                        createdAt:
                            Date.now()
                    }
                );

                const dmButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `recrutement_dm_start_${poste}`
                        )
                        .setLabel(
                            'Commencer ma candidature'
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji(
                            '📋'
                        );

                const dmSent =
                    await safeSendDM(
                        interaction.user,
                        {

                            content:
                                `📋 **Candidature — ${form.name}**\n\n` +
                                `${form.description}\n\n` +
                                'Ton formulaire est prêt. Clique sur le bouton ci-dessous pour commencer.',

                            components: [
                                new ActionRowBuilder()
                                    .addComponents(
                                        dmButton
                                    )
                            ]
                        }
                    );

                if (!dmSent) {

                    recruitmentData.delete(
                        interaction.user.id
                    );

                    return interaction.editReply({

                        content:
                            '❌ Je ne peux pas t’envoyer de MP. Vérifie que tes messages privés sont ouverts sur ce serveur puis réessaie.',

                        components: []
                    });
                }

                return interaction.editReply({

                    content:
                        `✅ Le formulaire **${form.name}** vient de t’être envoyé en MP !`,

                    components: []
                });
            }

            // ====================================================
            // RECRUTEMENT — BOUTON DANS LES MP
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'recrutement_dm_start_'
                )
            ) {

                const poste =
                    interaction.customId.replace(
                        'recrutement_dm_start_',
                        ''
                    );

                const session =
                    recruitmentData.get(
                        interaction.user.id
                    );

                if (
                    !session ||
                    session.poste !==
                        poste
                ) {

                    return interaction.reply({

                        content:
                            '❌ Ta session de candidature n’est plus disponible. Retourne sur le panneau de recrutement d’Ultra Pub pour recommencer.'
                    });
                }

                // Ici c'est bien un BUTTON interaction.
                // showModal() est donc autorisé.
                return interaction.showModal(
                    buildRecruitmentModal(
                        poste,
                        1
                    )
                );
            }

            // ====================================================
            // RECRUTEMENT — BOUTON ÉTAPE SUIVANTE
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'recrutement_next_'
                )
            ) {

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const poste =
                    parts[2];

                const step =
                    Number(
                        parts[3]
                    );

                const form =
                    recruitmentForms[
                        poste
                    ];

                const session =
                    recruitmentData.get(
                        interaction.user.id
                    );

                if (
                    !form ||
                    !session ||
                    session.poste !==
                        poste
                ) {

                    return interaction.reply({

                        content:
                            '❌ Ta session de candidature est introuvable. Recommence depuis le panneau de recrutement.'
                    });
                }

                session.step =
                    step;

                recruitmentData.set(
                    interaction.user.id,
                    session
                );

                // IMPORTANT :
                // Le bouton est une interaction Button,
                // donc showModal() est autorisé.
                return interaction.showModal(
                    buildRecruitmentModal(
                        poste,
                        step
                    )
                );
            }

            // ====================================================
            // RECRUTEMENT — SOUMISSION D'UNE MODALE
            // ====================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    'recrutement_modal_'
                )
            ) {

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const poste =
                    parts[2];

                const step =
                    Number(
                        parts[3]
                    );

                const form =
                    recruitmentForms[
                        poste
                    ];

                const session =
                    recruitmentData.get(
                        interaction.user.id
                    );

                if (
                    !form ||
                    !session ||
                    session.poste !==
                        poste
                ) {

                    return interaction.reply({

                        content:
                            '❌ Ta session de candidature est introuvable. Recommence depuis le panneau de recrutement.'
                    });
                }

                const start =
                    (step - 1) * 5;

                const questions =
                    form.questions.slice(
                        start,
                        start + 5
                    );

                // Enregistrement des réponses
                for (
                    const question
                    of questions
                ) {

                    const value =
                        interaction.fields
                            .getTextInputValue(
                                question.id
                            )
                            .trim();

                    session.answers[
                        question.id
                    ] = value;
                }

                session.step =
                    step;

                recruitmentData.set(
                    interaction.user.id,
                    session
                );

                const totalSteps =
                    Math.ceil(
                        form.questions.length /
                        5
                    );

                // =================================================
                // IL RESTE DES ÉTAPES
                // =================================================

                if (
                    step <
                    totalSteps
                ) {

                    const nextStep =
                        step + 1;

                    const nextButton =
                        new ButtonBuilder()
                            .setCustomId(
                                `recrutement_next_${poste}_${nextStep}`
                            )
                            .setLabel(
                                `➡️ Étape suivante (${nextStep}/${totalSteps})`
                            )
                            .setStyle(
                                ButtonStyle.Primary
                            );

                    return interaction.reply({

                        content:
                            `✅ **Étape ${step}/${totalSteps} terminée !**\n\n` +
                            'Clique sur le bouton ci-dessous pour continuer ta candidature.',

                        components: [
                            new ActionRowBuilder()
                                .addComponents(
                                    nextButton
                                )
                        ]
                    });
                }

                // =================================================
                // DERNIÈRE ÉTAPE
                // =================================================

                await interaction.deferReply();

                try {

                    await submitRecruitmentApplication(
                        interaction,
                        session
                    );

                    recruitmentData.delete(
                        interaction.user.id
                    );

                    return interaction.editReply({

                        content:
                            '✅ **Ta candidature a bien été envoyée !**\n\n' +
                            'Elle va maintenant être étudiée par la direction d’Ultra Pub.\n' +
                            'Un sondage a été créé dans le thread **Réponse Candid** pour permettre au staff de donner son avis.'
                    });

                } catch (error) {

                    console.error(
                        'Erreur envoi candidature :',
                        error
                    );

                    return interaction.editReply({

                        content:
                            '❌ Une erreur est survenue lors de l’envoi de ta candidature. Contacte un membre de la direction.'
                    });
                }
            }

            // ====================================================
            // RANK — OUVERTURE
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    'rank_open_form'
            ) {

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            'rank_submit_form'
                        )
                        .setTitle(
                            'Demande de changement de grade'
                        );

                const currentRank =
                    new TextInputBuilder()
                        .setCustomId(
                            'rank_current'
                        )
                        .setLabel(
                            'Ton grade actuel'
                        )
                        .setPlaceholder(
                            'Modo, Community Manager ou Créa/Dev'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            100
                        );

                const desiredRank =
                    new TextInputBuilder()
                        .setCustomId(
                            'rank_desired'
                        )
                        .setLabel(
                            'Le grade souhaité'
                        )
                        .setPlaceholder(
                            'Modo, Community Manager ou Créa/Dev'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            100
                        );

                const reason =
                    new TextInputBuilder()
                        .setCustomId(
                            'rank_reason'
                        )
                        .setLabel(
                            'Pour quelle raison ?'
                        )
                        .setPlaceholder(
                            'Explique pourquoi tu souhaites ce changement...'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            1000
                        );

                const keepRank =
                    new TextInputBuilder()
                        .setCustomId(
                            'rank_keep'
                        )
                        .setLabel(
                            'Garder ton grade actuel ?'
                        )
                        .setPlaceholder(
                            'Oui ou non'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            20
                        );

                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            currentRank
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            desiredRank
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            reason
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            keepRank
                        )
                );

                return interaction.showModal(
                    modal
                );
            }

            // ====================================================
            // RANK — ENVOI
            // ====================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'rank_submit_form'
            ) {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                const currentRank =
                    interaction.fields
                        .getTextInputValue(
                            'rank_current'
                        )
                        .trim();

                const desiredRank =
                    interaction.fields
                        .getTextInputValue(
                            'rank_desired'
                        )
                        .trim();

                const reason =
                    interaction.fields
                        .getTextInputValue(
                            'rank_reason'
                        )
                        .trim();

                const keepRank =
                    interaction.fields
                        .getTextInputValue(
                            'rank_keep'
                        )
                        .trim();

                const normalizeRank =
                    value =>
                        value
                            .toLowerCase()
                            .replace(
                                /\s+/g,
                                ''
                            );

                const validCurrent =
                    ALLOWED_RANKS.find(
                        rank =>
                            normalizeRank(
                                rank
                            ) ===
                            normalizeRank(
                                currentRank
                            )
                    );

                const validDesired =
                    ALLOWED_RANKS.find(
                        rank =>
                            normalizeRank(
                                rank
                            ) ===
                            normalizeRank(
                                desiredRank
                            )
                    );

                if (
                    !validCurrent ||
                    !validDesired
                ) {

                    return interaction.editReply({

                        content:
                            '❌ Les grades acceptés sont uniquement : **Modo**, **Community Manager** et **Créa/Dev**.'
                    });
                }

                if (
                    ![
                        'oui',
                        'non'
                    ].includes(
                        normalizeRank(
                            keepRank
                        )
                    )
                ) {

                    return interaction.editReply({

                        content:
                            '❌ Pour la question du maintien de ton grade, réponds uniquement par **Oui** ou **Non**.'
                    });
                }

                const requestChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        RANK_REQUEST_CHANNEL_ID
                    );

                if (!requestChannel) {

                    return interaction.editReply({

                        content:
                            '❌ Le salon de réception des demandes de grade est introuvable.'
                    });
                }

                const requestId =
                    Date.now().toString(
                        36
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📋 Nouvelle demande de changement de grade'
                        )
                        .setColor(
                            '#5865F2'
                        )
                        .setDescription(
                            `**Membre :** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                            `**Grade actuel :** ${validCurrent}\n` +
                            `**Grade souhaité :** ${validDesired}\n` +
                            `**Raison :**\n${truncate(reason, 1000)}\n\n` +
                            `**Garder le grade actuel ?** ${keepRank}`
                        )
                        .setFooter({
                            text:
                                `Demande ${requestId} • En attente de décision`
                        })
                        .setTimestamp();

                await requestChannel.send({

                    content:
                        '📨 **Nouvelle demande à examiner par l’administration.**',

                    embeds: [
                        embed
                    ],

                    components: [
                        createRankDecisionRow(
                            interaction.user.id,
                            requestId
                        )
                    ],

                    allowedMentions: {
                        parse: []
                    }
                });

                await interaction.editReply({

                    content:
                        '✅ Ta demande a bien été envoyée à l’administration.'
                });

                await safeSendDM(
                    interaction.user,
                    {
                        content:
                            '📨 Ta demande de changement de grade a bien été envoyée à l’administration. Tu recevras un message privé lorsque la décision sera prise.'
                    }
                );

                return;
            }

            // ====================================================
            // RANK — DÉCISION
            // ====================================================

            if (
                interaction.isButton() &&
                (
                    interaction.customId.startsWith(
                        'rank_approve_'
                    ) ||
                    interaction.customId.startsWith(
                        'rank_reject_'
                    )
                )
            ) {

                if (
                    !interaction.memberPermissions?.has(
                        PermissionFlagsBits.ManageMessages
                    )
                ) {

                    return interaction.reply({

                        content:
                            '❌ Seuls les membres de l’administration autorisés peuvent traiter ces demandes.',

                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const decision =
                    parts[1];

                const userId =
                    parts[2];

                await interaction.deferUpdate();

                const targetUser =
                    await client.users
                        .fetch(
                            userId
                        )
                        .catch(
                            () => null
                        );

                const oldEmbed =
                    interaction.message
                        .embeds?.[0];

                if (!oldEmbed) {

                    return interaction.followUp({

                        content:
                            '❌ Impossible de retrouver les informations de la demande.',

                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                const isApproved =
                    decision ===
                    'approve';

                const updatedEmbed =
                    EmbedBuilder.from(
                        oldEmbed
                    )
                        .setColor(
                            isApproved
                                ? '#2ECC71'
                                : '#E74C3C'
                        )
                        .setFooter({
                            text:
                                `${isApproved ? 'Demande validée' : 'Demande refusée'} par ${interaction.user.tag}`
                        })
                        .setTimestamp();

                await interaction.message.edit({

                    embeds: [
                        updatedEmbed
                    ],

                    components: []
                });

                if (targetUser) {

                    if (
                        isApproved
                    ) {

                        await safeSendDM(
                            targetUser,
                            {
                                content:
                                    '✅ **Ta demande de changement de grade a été acceptée !**\n\n' +
                                    'Le changement de grade sera effectué **le prochain samedi**.'
                            }
                        );

                    } else {

                        await safeSendDM(
                            targetUser,
                            {
                                content:
                                    '❌ **Ta demande de changement de grade a été refusée.**\n\n' +
                                    'Pour obtenir plus d’informations, merci de contacter un administrateur.'
                            }
                        );
                    }
                }

                return interaction.followUp({

                    content:
                        isApproved
                            ? '✅ Demande validée. Le membre a été averti par MP.'
                            : '❌ Demande refusée. Le membre a été averti par MP.',

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ====================================================
            // PARTENARIAT — MENTION
            // ====================================================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId ===
                    'partenariat_select_mention'
            ) {

                const data =
                    partnershipData.get(
                        interaction.user.id
                    ) || {};

                data.mention =
                    interaction.values[0];

                partnershipData.set(
                    interaction.user.id,
                    data
                );

                return interaction.reply({

                    content:
                        `✅ Mention sélectionnée : **${interaction.values[0]}**`,

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ====================================================
            // PARTENARIAT — PARTENAIRE
            // ====================================================

            if (
                interaction.isUserSelectMenu() &&
                interaction.customId ===
                    'partenariat_select_partner'
            ) {

                const data =
                    partnershipData.get(
                        interaction.user.id
                    ) || {};

                data.partnerId =
                    interaction.values[0];

                partnershipData.set(
                    interaction.user.id,
                    data
                );

                return interaction.reply({

                    content:
                        `✅ Partenaire sélectionné : <@${interaction.values[0]}>`,

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ====================================================
            // PARTENARIAT — OUVERTURE MODALE
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    'partenariat_btn_open_modal'
            ) {

                const data =
                    partnershipData.get(
                        interaction.user.id
                    );

                if (
                    !data?.mention ||
                    !data?.partnerId
                ) {

                    return interaction.reply({

                        content:
                            '❌ Sélectionne d’abord une mention et un partenaire.',

                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            'partenariat_modal_submit'
                        )
                        .setTitle(
                            'Description du partenariat'
                        );

                const pubInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'partenariat_pub_content'
                        )
                        .setLabel(
                            'Description du partenariat / publicité'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setPlaceholder(
                            'Décris le partenariat que tu souhaites proposer...'
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            1800
                        );

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(
                            pubInput
                        )
                );

                return interaction.showModal(
                    modal
                );
            }

            // ====================================================
            // PARTENARIAT — ENVOI
            // ====================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'partenariat_modal_submit'
            ) {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                const data =
                    partnershipData.get(
                        interaction.user.id
                    );

                if (
                    !data?.mention ||
                    !data?.partnerId
                ) {

                    return interaction.editReply({

                        content:
                            '❌ Les informations du partenariat sont incomplètes. Recommence la commande.'
                    });
                }

                const description =
                    interaction.fields
                        .getTextInputValue(
                            'partenariat_pub_content'
                        );

                const targetChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        PARTENARIAT_CHANNEL_ID
                    );

                if (!targetChannel) {

                    return interaction.editReply({

                        content:
                            '❌ Le salon de partenariat est introuvable.'
                    });
                }

                const partnerMember =
                    await interaction.guild
                        .members
                        .fetch(
                            data.partnerId
                        )
                        .catch(
                            () => null
                        );

                if (partnerMember) {

                    await partnerMember
                        .roles
                        .add(
                            PARTENAIRE_ROLE_ID
                        )
                        .catch(
                            error => {

                                console.error(
                                    'Erreur attribution rôle partenaire :',
                                    error
                                );
                            }
                        );
                }

                let mentionString =
                    '';

                let allowedMentions = {
                    parse: []
                };

                if (
                    data.mention ===
                    'everyone'
                ) {

                    mentionString =
                        '@everyone';

                    allowedMentions = {
                        parse: [
                            'everyone'
                        ]
                    };

                } else if (
                    data.mention ===
                    'here'
                ) {

                    mentionString =
                        '@here';

                    allowedMentions = {
                        parse: [
                            'everyone'
                        ]
                    };

                } else if (
                    data.mention ===
                    'role_partenariat'
                ) {

                    mentionString =
                        `<@&${NOTIF_PARTENARIAT_ROLE_ID}>`;

                    allowedMentions = {
                        roles: [
                            NOTIF_PARTENARIAT_ROLE_ID
                        ]
                    };
                }

                await targetChannel.send({

                    content:
                        truncate(
                            `${mentionString}\n\n${description}`,
                            1990
                        ),

                    allowedMentions
                });

                const summaryEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            '📢 Ultra Pub | Partenariat effectué'
                        )
                        .setColor(
                            '#2F3136'
                        )
                        .setDescription(
                            `**Partenaire :** <@${data.partnerId}>\n` +
                            `**Mention utilisée :** ${mentionString || 'Aucune'}`
                        )
                        .setFooter({
                            text:
                                `Effectué par ${interaction.user.username}`
                        })
                        .setTimestamp();

                await targetChannel.send({

                    embeds: [
                        summaryEmbed
                    ],

                    allowedMentions: {
                        parse: []
                    }
                });

                getStaffStats(
                    interaction.user.id
                ).partnerships++;

                partnershipData.delete(
                    interaction.user.id
                );

                return interaction.editReply({

                    content:
                        '🚀 Le partenariat a été envoyé avec succès !'
                });
            }

            // ====================================================
            // PUBLICITÉS — BOUTONS
            // ====================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'pub_'
                )
            ) {

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const action =
                    parts[1];

                // =================================================
                // AIDE
                // =================================================

                if (
                    action ===
                    'help'
                ) {

                    return interaction.reply({

                        content:
                            `⚠️ ${interaction.user} demande de l’aide pour vérifier cette publicité.`,

                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                // =================================================
                // LOG ACCEPT / REFUSE
                // =================================================

                if (
                    action ===
                        'logaccept' ||
                    action ===
                        'logrefuse'
                ) {

                    await interaction.deferReply({
                        flags:
                            MessageFlags.Ephemeral
                    });

                    const oldEmbed =
                        interaction.message
                            .embeds?.[0];

                    if (!oldEmbed) {

                        return interaction.editReply({

                            content:
                                '❌ Impossible de retrouver l’embed du log.'
                        });
                    }

                    const accepted =
                        action ===
                        'logaccept';

                    const newEmbed =
                        EmbedBuilder.from(
                            oldEmbed
                        )
                            .setTitle(
                                accepted
                                    ? '✅ Publicité re-validée (mise à jour via log)'
                                    : '🛑 Publicité refusée (mise à jour via log)'
                            )
                            .setColor(
                                accepted
                                    ? '#2ECC71'
                                    : '#E74C3C'
                            );

                    await interaction.message.edit({

                        embeds: [
                            newEmbed
                        ],

                        components: []
                    });

                    return interaction.editReply({

                        content:
                            accepted
                                ? '✅ Le statut du log a été mis à jour : validée.'
                                : '🛑 Le statut du log a été mis à jour : refusée.'
                    });
                }

                // =================================================
                // LOG SANCTION
                // =================================================

                if (
                    action ===
                    'logsanction'
                ) {

                    const authorId =
                        parts[2];

                    const channelId =
                        parts[3];

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                `pub_modal_logsanction_${authorId}_${channelId}`
                            )
                            .setTitle(
                                'Modifier la sanction depuis le log'
                            );

                    const reasonInput =
                        new TextInputBuilder()
                            .setCustomId(
                                'sanction_reason'
                            )
                            .setLabel(
                                'Motif / détails'
                            )
                            .setStyle(
                                TextInputStyle.Paragraph
                            )
                            .setPlaceholder(
                                'Explique la mise à jour de la sanction...'
                            )
                            .setRequired(
                                true
                            )
                            .setMaxLength(
                                1000
                            );

                    modal.addComponents(
                        new ActionRowBuilder()
                            .addComponents(
                                reasonInput
                            )
                    );

                    return interaction.showModal(
                        modal
                    );
                }

                // =================================================
                // PUBLICITÉ CLASSIQUE
                // =================================================

                const messageId =
                    parts[2];

                const channelId =
                    parts[3];

                const authorId =
                    parts[4];

                const originalContent =
                    truncate(
                        interaction.message
                            .content ||
                        '*Contenu multimédia / embed*',
                        1900
                    );

                // =================================================
                // ACCEPTER
                // =================================================

                if (
                    action ===
                    'accept'
                ) {

                    await interaction.deferUpdate();

                    pubStatsHistory.push({

                        staffId:
                            interaction.user.id,

                        timestamp:
                            Date.now(),

                        type:
                            'accepted'
                    });

                    getStaffStats(
                        interaction.user.id
                    ).pubsVerified++;

                    await interaction.message
                        .edit({
                            components: []
                        })
                        .catch(
                            () => null
                        );

                    const logChannel =
                        await fetchTextChannel(
                            interaction.guild,
                            PUB_LOG_CHANNEL_ID
                        );

                    if (logChannel) {

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '✅ Publicité validée'
                                )
                                .setColor(
                                    '#2ECC71'
                                )
                                .addFields(
                                    {
                                        name:
                                            '👤 Auteur',
                                        value:
                                            `<@${authorId}>`,
                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '🛡️ Modérateur',
                                        value:
                                            `<@${interaction.user.id}>`,
                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '📍 Salon',
                                        value:
                                            `<#${channelId}>`,
                                        inline:
                                            true
                                    }
                                )
                                .setTimestamp();

                        const row =
                            new ActionRowBuilder()
                                .addComponents(

                                    new ButtonBuilder()
                                        .setCustomId(
                                            `pub_logrefuse_${authorId}_${channelId}`
                                        )
                                        .setLabel(
                                            'Passer en refusée'
                                        )
                                        .setStyle(
                                            ButtonStyle.Danger
                                        )
                                        .setEmoji(
                                            '🛑'
                                        ),

                                    new ButtonBuilder()
                                        .setCustomId(
                                            `pub_logsanction_${authorId}_${channelId}`
                                        )
                                        .setLabel(
                                            'Passer en sanctionnée'
                                        )
                                        .setStyle(
                                            ButtonStyle.Primary
                                        )
                                        .setEmoji(
                                            '❗'
                                        )
                                );

                        await logChannel.send({

                            content:
                                `📝 **Publicité validée :**\n>>> ${originalContent}`,

                            embeds: [
                                embed
                            ],

                            components: [
                                row
                            ],

                            allowedMentions: {
                                parse: []
                            }
                        });
                    }

                    return interaction.followUp({

                        content:
                            '✅ Publicité acceptée avec succès.',

                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                // =================================================
                // REFUSER
                // =================================================

                if (
                    action ===
                    'refuse'
                ) {

                    await interaction.deferUpdate();

                    pubStatsHistory.push({

                        staffId:
                            interaction.user.id,

                        timestamp:
                            Date.now(),

                        type:
                            'refused'
                    });

                    getStaffStats(
                        interaction.user.id
                    ).pubsVerified++;

                    const originalChannel =
                        await fetchTextChannel(
                            interaction.guild,
                            channelId
                        );

                    if (
                        originalChannel
                    ) {

                        const originalMessage =
                            await originalChannel
                                .messages
                                .fetch(
                                    messageId
                                )
                                .catch(
                                    () => null
                                );

                        if (
                            originalMessage?.deletable
                        ) {

                            await originalMessage
                                .delete()
                                .catch(
                                    error => {

                                        console.error(
                                            'Suppression de la pub refusée impossible :',
                                            error
                                        );
                                    }
                                );
                        }
                    }

                    await interaction.message
                        .delete()
                        .catch(
                            () => null
                        );

                    const logChannel =
                        await fetchTextChannel(
                            interaction.guild,
                            PUB_LOG_CHANNEL_ID
                        );

                    if (logChannel) {

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '🛑 Publicité refusée'
                                )
                                .setColor(
                                    '#E74C3C'
                                )
                                .addFields(
                                    {
                                        name:
                                            '👤 Auteur',
                                        value:
                                            `<@${authorId}>`,
                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '🛡️ Modérateur',
                                        value:
                                            `<@${interaction.user.id}>`,
                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '📍 Salon',
                                        value:
                                            `<#${channelId}>`,
                                        inline:
                                            true
                                    }
                                )
                                .setTimestamp();

                        const row =
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(
                                            `pub_logaccept_${authorId}_${channelId}`
                                        )
                                        .setLabel(
                                            'Re-valider la pub'
                                        )
                                        .setStyle(
                                            ButtonStyle.Success
                                        )
                                        .setEmoji(
                                            '🟢'
                                        )
                                );

                        await logChannel.send({

                            content:
                                `📝 **Publicité refusée :**\n>>> ${originalContent}`,

                            embeds: [
                                embed
                            ],

                            components: [
                                row
                            ],

                            allowedMentions: {
                                parse: []
                            }
                        });
                    }

                    return;
                }

                // =================================================
                // SANCTION
                // =================================================

                if (
                    action ===
                    'sanction'
                ) {

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                `pub_modal_sanction_${messageId}_${channelId}_${authorId}`
                            )
                            .setTitle(
                                'Sanctionner une publicité'
                            );

                    const reasonInput =
                        new TextInputBuilder()
                            .setCustomId(
                                'sanction_reason'
                            )
                            .setLabel(
                                'Raison de la sanction'
                            )
                            .setStyle(
                                TextInputStyle.Paragraph
                            )
                            .setPlaceholder(
                                'Explique la raison de la sanction...'
                            )
                            .setRequired(
                                true
                            )
                            .setMaxLength(
                                1000
                            );

                    modal.addComponents(
                        new ActionRowBuilder()
                            .addComponents(
                                reasonInput
                            )
                    );

                    return interaction.showModal(
                        modal
                    );
                }
            }

            // ====================================================
            // SANCTION PUBLICITÉ
            // ====================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    'pub_modal_sanction_'
                )
            ) {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const messageId =
                    parts[3];

                const channelId =
                    parts[4];

                const authorId =
                    parts[5];

                const reason =
                    interaction.fields
                        .getTextInputValue(
                            'sanction_reason'
                        );

                pubStatsHistory.push({

                    staffId:
                        interaction.user.id,

                    timestamp:
                        Date.now(),

                    type:
                        'sanctioned'
                });

                getStaffStats(
                    interaction.user.id
                ).pubsVerified++;

                const originalChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        channelId
                    );

                if (
                    originalChannel
                ) {

                    const originalMessage =
                        await originalChannel
                            .messages
                            .fetch(
                                messageId
                            )
                            .catch(
                                () => null
                            );

                    if (
                        originalMessage?.deletable
                    ) {

                        await originalMessage
                            .delete()
                            .catch(
                                error => {

                                    console.error(
                                        'Suppression de la pub sanctionnée impossible :',
                                        error
                                    );
                                }
                            );
                    }
                }

                await interaction.message
                    .delete()
                    .catch(
                        () => null
                    );

                const sanctionEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            '🚨 Publicité sanctionnée'
                        )
                        .setColor(
                            '#9B59B6'
                        )
                        .addFields(
                            {
                                name:
                                    '👤 Auteur',
                                value:
                                    `<@${authorId}>`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '🛡️ Modérateur',
                                value:
                                    `<@${interaction.user.id}>`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '📍 Salon',
                                value:
                                    `<#${channelId}>`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    '⚠️ Raison',
                                value:
                                    truncate(
                                        reason,
                                        1000
                                    ),
                                inline:
                                    false
                            }
                        )
                        .setTimestamp();

                const targetMember =
                    await interaction.guild
                        .members
                        .fetch(
                            authorId
                        )
                        .catch(
                            () => null
                        );

                if (
                    targetMember
                ) {

                    await safeSendDM(
                        targetMember,
                        {

                            content:
                                `⚠️ Ta publicité dans <#${channelId}> a été sanctionnée.\n` +
                                `**Raison :** ${reason}`,

                            embeds: [
                                sanctionEmbed
                            ]
                        }
                    );
                }

                const publicSanctionChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        PUB_SANCTION_CHANNEL_ID
                    );

                if (
                    publicSanctionChannel
                ) {

                    await publicSanctionChannel.send({

                        content:
                            `🚨 **Sanction appliquée à <@${authorId}>**`,

                        embeds: [
                            sanctionEmbed
                        ],

                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                const logChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        PUB_LOG_CHANNEL_ID
                    );

                if (logChannel) {

                    const row =
                        new ActionRowBuilder()
                            .addComponents(

                                new ButtonBuilder()
                                    .setCustomId(
                                        `pub_logaccept_${authorId}_${channelId}`
                                    )
                                    .setLabel(
                                        'Annuler la sanction / valider la pub'
                                    )
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                                    .setEmoji(
                                        '🟢'
                                    )
                            );

                    await logChannel.send({

                        content:
                            '📝 **Publicité sanctionnée.**',

                        embeds: [
                            sanctionEmbed
                        ],

                        components: [
                            row
                        ],

                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                return interaction.editReply({

                    content:
                        '🚨 Sanction enregistrée et envoyée au membre, au salon dédié et dans les logs.'
                });
            }

            // ====================================================
            // MISE À JOUR SANCTION LOG
            // ====================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    'pub_modal_logsanction_'
                )
            ) {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                const parts =
                    interaction.customId.split(
                        '_'
                    );

                const authorId =
                    parts[3];

                const channelId =
                    parts[4];

                const reason =
                    interaction.fields
                        .getTextInputValue(
                            'sanction_reason'
                        );

                const oldEmbed =
                    interaction.message
                        .embeds?.[0];

                if (!oldEmbed) {

                    return interaction.editReply({

                        content:
                            '❌ Impossible de retrouver l’embed du log.'
                    });
                }

                const updatedEmbed =
                    EmbedBuilder.from(
                        oldEmbed
                    )
                        .setTitle(
                            '🚨 Publicité sanctionnée (mise à jour)'
                        )
                        .setColor(
                            '#9B59B6'
                        )
                        .addFields({
                            name:
                                '⚠️ Raison (mise à jour)',
                            value:
                                truncate(
                                    reason,
                                    1000
                                ),
                            inline:
                                false
                        });

                await interaction.message.edit({

                    embeds: [
                        updatedEmbed
                    ]
                });

                const targetMember =
                    await interaction.guild
                        .members
                        .fetch(
                            authorId
                        )
                        .catch(
                            () => null
                        );

                if (
                    targetMember
                ) {

                    await safeSendDM(
                        targetMember,
                        {

                            content:
                                `⚠️ Mise à jour de ta sanction concernant ta publicité dans <#${channelId}>.\n` +
                                `**Raison :** ${reason}`
                        }
                    );
                }

                const publicSanctionChannel =
                    await fetchTextChannel(
                        interaction.guild,
                        PUB_SANCTION_CHANNEL_ID
                    );

                if (
                    publicSanctionChannel
                ) {

                    await publicSanctionChannel.send({

                        content:
                            `🚨 **Mise à jour de la sanction de <@${authorId}>**`,

                        embeds: [
                            updatedEmbed
                        ],

                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                return interaction.editReply({

                    content:
                        '✅ La sanction a été mise à jour dans les logs et le salon dédié. Le membre a été averti par MP.'
                });
            }

        } catch (error) {

            console.error(
                '===================================='
            );

            console.error(
                '❌ ERREUR interactionCreate'
            );

            console.error(
                'Utilisateur :',
                interaction.user?.tag
            );

            console.error(
                'Type :',
                interaction.type
            );

            console.error(
                'Custom ID :',
                interaction.customId ||
                'Aucun'
            );

            console.error(
                'Serveur :',
                interaction.guild?.name
            );

            console.error(
                error
            );

            console.error(
                '===================================='
            );

            try {

                const response = {
                    content:
                        '❌ Une erreur est survenue. Consulte la console du bot pour plus de détails.',

                    flags:
                        MessageFlags.Ephemeral
                };

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    await interaction
                        .followUp(
                            response
                        )
                        .catch(
                            () => null
                        );

                } else if (
                    interaction.isRepliable()
                ) {

                    await interaction
                        .reply(
                            response
                        )
                        .catch(
                            () => null
                        );
                }

            } catch {}
        }
    }
);

// ============================================================
// ERREURS GLOBALES
// ============================================================

process.on(
    'unhandledRejection',
    reason => {

        console.error(
            '❌ Unhandled Rejection :',
            reason
        );
    }
);

process.on(
    'uncaughtException',
    error => {

        console.error(
            '❌ Uncaught Exception :',
            error
        );
    }
);

process.on(
    'warning',
    warning => {

        console.warn(
            '⚠️ Node Warning :',
            warning
        );
    }
);

client.on(
    'error',
    error => {

        console.error(
            '❌ Discord Client Error :',
            error
        );
    }
);

client.on(
    'warn',
    warning => {

        console.warn(
            '⚠️ Discord Warning :',
            warning
        );
    }
);

// ============================================================
// CONNEXION
// ============================================================

if (
    !process.env.DISCORD_TOKEN
) {

    console.error(
        '❌ DISCORD_TOKEN est manquant dans le fichier .env'
    );

    process.exit(1);
}

client.login(
    process.env.DISCORD_TOKEN
).catch(error => {

    console.error(
        '❌ Impossible de connecter le bot à Discord :',
        error
    );
});