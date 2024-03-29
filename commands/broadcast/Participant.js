const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
      .setName("participant")
      .setDescription("Add paticipants which are all mentioned with the /broadcast function")
      .addMentionableOption(option => option.setName("mention").setDescription('Enter the mention of the participant you want to add to broadcast').setRequired(true)),
      async execute(interaction) {
        await interaction.reply("Adding participants!");
      },
  };