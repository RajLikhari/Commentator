while true;
do
	if [[ -v ${PS_RUN} || -z ${PS_RUN} ]]; then
		nohup node Commentator.js > commentator.out 2>&1 &
		echo $! > run.pid
		if [[ $! == 0 ]]; then
			echo "----FAILED TO RUN COMMENTATOR... EXITING----"
			exit
		elif [[ $! != 0 ]]; then
			export PS_RUN=$(cat run.pid)
			echo "----DEPLOYMENT SUCCESSFUL --- PID:${PS_RUN}----"
		fi
			
	else 
		current_status=$(ps aux | grep $(echo $PS_RUN))
		IFS=' ' read -ra ADDR <<< "$current_status"
		is_active=false
		for i in "${ADDR[@]}":
		do
			if [[ "$i" == ${PS_RUN} ]]; then
				echo "----DEPLOYMENT ACTIVE --- PID:${PS_RUN}----"
				is_active=true
			fi
		done
		if [[ $is_active == false ]]; then
			echo "---DEPLOYMENT KILLED----"
			unset PS_RUN
		fi
	fi
	echo "----SLEEPING FOR 10 SECOONDS----"
	sleep 10
done
