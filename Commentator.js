const { discord_token } = require("./config.json");
const fs = require("node:fs");
const path = require('node:path');
const googleTTS = require("google-tts-api"); // CommonJS
const { Client, GatewayIntentBits, Events, Collection } = require("discord.js");
const { getVoiceConnection, createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus } = require("@discordjs/voice");
const { stderr, stdout } = require("node:process");
var exec = require('child_process').exec;

//Setting up Intents, which are permissions assigned in the Discord Developer Portal
let current_channel_id = ""; //Current channel ID to which the bot is connected to
let audio_queue = []; //Queue of all audios which need to be played
let played_audios = [];
let member_tracker = [] //Array of members which tracks events
let user_mentions = [] //Array of members which are mentioned via the broadcast function
let audio_tracker = 0;
const player = createAudioPlayer();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

//Bringing in and setting up all necessary commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

//Function which is called when a command (interaction) is triggered
client.on(Events.InteractionCreate, async interaction => {
    let update_timestamp = new Date().toLocaleString();
    if(interaction.commandName === 'commentate'){ //Dodging execute function to work with local variables
        let active_channel = interaction.member.voice.channel
        let channel_id = interaction.member.voice.channel.id;
        if(active_channel){
            if(current_channel_id !== channel_id){
                //Reset the current commentator, if it is already enabled
                let connection = getVoiceConnection(interaction.guild.id);
                if(connection){ //Only delete the connection, if the connection is present
                    console.log(`The Commentator has manually left ${current_channel_id} at ${update_timestamp}`)
                    connection.destroy();
                    audio_queue = [];
                    member_tracker = [];
                }
                //Once the previous commentator has been destroyed, make a new one
                current_channel_id = channel_id;
                let new_connection = joinVoiceChannel({ 
                    channelId: channel_id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                new_connection.subscribe(player)
                console.log(`The Commentator has manually joined ${channel_id} at ${update_timestamp}`)
                await interaction.reply({ content: `The Commentator has joined your voice channel!`, ephemeral: true });
            } else {
                await interaction.reply({ content: `The Commentator has already joined your voice channel!`, ephemeral: true });
            }
        } else {
            await interaction.reply({ content: `You must join a voice channel first!`, ephemeral: true });
        }
    } else if (interaction.commandName === "disconnect"){
        try{
            let connection = getVoiceConnection(interaction.guild.id);
            if(connection){ //Only delete the connection, if the connection is present
                console.log(`The Commentator has manually been disconnected at ${update_timestamp}`)
                current_channel_id = "";
                connection.destroy();
                audio_queue = [];
                member_tracker = [];
                await interaction.reply({ content: `The Commentator has been disconnected`, ephemeral: true });
            } else {
                await interaction.reply({ content: `The Commentator was not connected.`, ephemeral: true });
            }
        } catch (exception){
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    } else if (interaction.commandName === 'participant'){
        has_user = false;
        const user_mention = interaction.options.getMember('mention');
        user_mentions.forEach((user) => { if(user.user.username === user_mention.user.username){ has_user = true; }})
        if(!has_user){ user_mentions.push(user_mention) }
        await interaction.reply({ content: `${user_mention.user.username} has been added for broadcast!`, ephemeral: true });
    } else if (interaction.commandName === 'broadcast'){
        let mention_message = "Hey "
        let text_channel_id = interaction.channelId;
        const channel = client.channels.cache.get(text_channel_id);
        user_mentions.forEach((user) => { mention_message = mention_message + `${user} `})
        mention_message = mention_message + "lets play some games!"
        channel.send(mention_message)
        await interaction.reply({ content: `Broadcast completed!`, ephemeral: true });
    }
});

//Function which is called once the discord bot has been prepared
client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

//Function which will monitor the state of the audio queue and play audio if necessary
player.on(AudioPlayerStatus.Idle, () => {
    runAudioPlayer();
})

//Main driver for detecting changes in voice updates and handling TTS
client.on(Events.VoiceStateUpdate, async (previous_state, new_state) => {
    
    //Setting up important variables used throughout the function
    let member_username = new_state.member.user.username ? new_state.member.user.username : (previous_state.member.user.username ? previous_state.member.user.username : "Unknown")
    let tracked_member = getTrackedMember(member_username);
    let update_timestamp = new Date().toLocaleString();
    let epoch_time = Date.now();
    let had_event = false;
    let connection;


    //Determine if the member is tracked, if so, analyze cooldown
    if(tracked_member){
        if(tracked_member.num_events === 2 && (Date.now() - tracked_member.cooldown_timestamp) < 10000){
            console.log(`${member_username} is on TTS cooldown for ${(10 - (Date.now() - tracked_member.cooldown_timestamp) / 1000)} more seconds`);
            return;
        } else if (tracked_member.num_events === 2 && (Date.now() - tracked_member.cooldown_timestamp) >= 10000){
            console.log(`${member_username} is now enabled for TTS`);
            tracked_member.num_events = 0;
            tracked_member.cooldown_timestamp = ''
        }

        //If the last time a specific user triggered an event was over 10 seconds ago, reset their num_events
        if((epoch_time - tracked_member.last_event) >= 10000){
            console.log(`${member_username}'s number of events reset due to exceeding 10 second cooldown`)
            tracked_member.num_events = 0;
            tracked_member.cooldown_timestamp = ''
        }
    }

    if(previous_state.member.user.bot || new_state.member.user.bot){ return } //Avoid anything to do with the bot
    if(previous_state.channelId === null && new_state.channelId !== null){ //User has joined a voice channel 

        //Checking to see if the commentator has joined the voice channel, otherwise connect to first
        //Join a voice channel and subscribe to the media player
        if(!current_channel_id){
            current_channel_id = new_state.channelId;
            connection = joinVoiceChannel({ 
              channelId: new_state.channel.id,
              guildId: new_state.channel.guild.id,
              adapterCreator: new_state.channel.guild.voiceAdapterCreator,
            });
            connection.subscribe(player)
            console.log(`The Commentator has automatically joined ${new_state.channelId}`)
        } else { connection = getVoiceConnection(new_state.guild.id); }
        console.log(`User ${member_username} has joined the voice channel at ${update_timestamp}`)  

        //Make sure that the new channel is the one the commentator is within
        if(new_state.channelId === current_channel_id){
            let welcome_message = !tracked_member ? `Welcome ${member_username}` : `Welcome back ${member_username}`
            audio_queue.push(generateTTSUrl(welcome_message));        
            had_event = true;
        }

    } else if(previous_state.channelId !== null && new_state.channelId === null){  //User has left the voice channel
        connection = getVoiceConnection(previous_state.guild.id); 
        console.log(`User ${member_username} has left the voice channel at ${update_timestamp}`)

        //Make sure that the old channel is the one the commentator is within
        if(previous_state.channelId === current_channel_id){
            audio_queue.push(generateTTSUrl(`${member_username} has left`))
            had_event = true;
        }
    } else if (previous_state.channelId !== new_state.channelId){ //User has changed the voice channel
        connection = getVoiceConnection(previous_state.guild.id); 
        console.log(`User ${member_username} has changed voice channels at ${update_timestamp}`)

        //Make sure that the new channel is the one the commentator is within
        if(new_state.channelId === current_channel_id){
            let welcome_message = !tracked_member ? `Welcome ${member_username}` : `Welcome back ${member_username}`
            audio_queue.push(generateTTSUrl(welcome_message))
            had_event = true;
        } else if (previous_state.channelId === current_channel_id){
            audio_queue.push(generateTTSUrl(`${member_username} has switched voice channels.`))
            had_event = true;
        }
    } else{
        connection = getVoiceConnection(previous_state.guild.id); 
        console.log(`User ${member_username} has changed their voice settings at ${update_timestamp}`)
    }

    //If an event has occured, track the user if not already tracked, otherwise setup some more tracking
    if(had_event){
        if(!tracked_member){
            member_tracker.push({key: member_username, num_events: 1, cooldown_timestamp: '', last_event: epoch_time })
        } else {
            tracked_member.num_events += 1;
            tracked_member.last_event = epoch_time;
        }      
    }

    //Check the audio player and the channel count to see if any action is required
    if(tracked_member && tracked_member.num_events === 2){ tracked_member.cooldown_timestamp = Date.now(); }
    if(player.state.status !== AudioPlayerStatus.Playing){ runAudioPlayer(); }
    if(current_channel_id){
        let defined_guild = new_state.guild ? new_state.guild : (previous_state.guild ? previous_state.guild : null);
        let current_channel = await defined_guild.channels.fetch(current_channel_id, { force: true });
        let active_members = new Collection(current_channel.members);
        if(active_members.size === 1 && active_members.at(0).user.username === "Commentator"){
            console.log(`The Commentator has automatically disconnected ${current_channel_id}`)
            connection.destroy();
            current_channel_id = "";
            audio_queue = [];
            member_tracker = [];
        }
    }

    console.log("Member Tracker: " + JSON.stringify(member_tracker) + "");
});

//Simple function which runs the first element of the audio queue
function runAudioPlayer(){
    let update_timestamp = new Date().toLocaleString();
    if(audio_queue.length !== 0){
        console.log(`Audio player is about to PLAY at ${update_timestamp}`)
        const audio_result = audio_queue.shift();
        audio_result.then((result) => {
            if(result !== 'unable_to_generate'){
                console.log('Utilizing audio result: ' + result)
                player.play(createAudioResource(result))
                played_audios.push(result)
            }
        })
    } else {
        console.log(`Audio player is IDLE at ${update_timestamp}`)
    }
}

//Simple function which returns the Google TTS Url
async function generateTTSUrl(tts_string){
    return new Promise(async (resolve, reject) => {
        await exec(`wget -r -l1 -H -nd -A mp3 -e robots=off \"${googleTTS.getAudioUrl(tts_string, {lang: 'en', slow: false, host: 'https://translate.google.com',})}\" -O audio/audio_file_${audio_tracker}.mp3`, 
        (error, stderr, stdout) => {
            if(error !== null){
                console.log("Unable to generate via curl: " + error)
                resolve('unable_to_generate');
            } else if (error === null){
                console.log("Generated audio file via curl: " + `audio_file_${audio_tracker}.mp3`)
                let connection_url = `audio/audio_file_${audio_tracker}.mp3`
                audio_tracker += 1;
                resolve(connection_url)
            }
        }
    )})
}

//Function which will return a tracked member based on username, if it is not tracked, it will return undefined
function getTrackedMember(username){
    return member_tracker.find((tracked_member) => tracked_member.key === username);
}

//SetInterval which is run to consistently cleanup all documents within the local repos
setInterval(() => {
	if(played_audios.length === 0){ return; }
    console.log("---RUNNING AUDIO CLEANUP---")
        exec(`rm ./audio/*`, (error, stderr, stdout) => {
            if(error === null){
                console.log(`---${played_audios.length} AUDIOS CLEANED---`)
                played_audios = []
            } else {
                console.log("An error has occured: " + error)
            }
	})
}, 60000)

//Class function which connects the discord bot to the server via the token
client.login(discord_token);
