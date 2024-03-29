const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
      .setName("broadcast")
      .setDescription("Mention all members, added with /participants, to play some games!"),
      async execute(interaction) {
        await interaction.reply("Mentioning participants!");
      },
  };