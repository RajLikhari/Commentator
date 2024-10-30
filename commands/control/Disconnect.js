const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Disconnect the Commentator within its active voice channel"),
    async execute(interaction) {
        await interaction.reply("Taking the Commentator to Death!");
    },
};
