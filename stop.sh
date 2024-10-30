kill $(cat run.pid)
rm run.pid 
rm nohup.out 
rm commentator.out
rm -rf audio
kill $(pgrep bash ./run.sh)