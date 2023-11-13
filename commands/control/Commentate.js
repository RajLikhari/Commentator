const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commentate")
    .setDescription("Activate the Commentator within the voice channel you are within"),
    async execute(interaction) {
      await interaction.reply("Bringing the Commentator to Life!");
    },
};
