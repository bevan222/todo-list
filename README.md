## set up api and database
1. docker-compose up // init docker
2. docker exec -it postgres bash // get into postgresql
3. psql -h localhost -U postgres // login as User:postgres
4. copy text in init.sql and paste in postgresql command

## set up React
1. cd .\todo-list\
2. npm install
3. npm start