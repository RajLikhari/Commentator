while true;
do
	if [[ -z ${PS_RUN} ]]
	then
		nohup node Commentator.js > commentator.out 2>&1 &
		echo $! > run.pid
		if [[ $! == 0 ]]
		then
			echo "----FAILED TO RUN COMMENTATOR... EXITING----"
			exit
		elif [[ $! != 0 ]]
		then
			export PS_RUN=$(cat run.pid)
			echo "----DEPLOYMENT SUCCESSFUL --- PID:${PS_RUN}----"
		fi
		
	else 
		is_active=false
		if ps -p ${PS_RUN} > /dev/null
		then
			echo "---DEPLOYMENT ACTIVE PID: ${PS_RUN}----"
			is_active=true
		fi
		if [[ $is_active == false ]]
		then
			echo "---DEPLOYMENT KILLED----"
			unset PS_RUN
		fi
	fi
	echo "----SLEEPING FOR 10 SECONDS----"
	sleep 10
done

