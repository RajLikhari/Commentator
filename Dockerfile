FROM --platform=linux/amd64 node:latest
WORKDIR /usr/src/app
COPY package.json .
RUN npm install
COPY . ./
CMD /bin/bash -c 'bash ./run.sh; /bin/bash'