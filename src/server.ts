import dotenv from "dotenv";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import pg from "pg";
import bodyParser from "body-parser";
const { Pool } = pg;

dotenv.config();
const port = process.env.APIPORT || 5000;
const app: Express = express();

app.use(express.json());
app.use(cors());


const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432")
});

const connectToDB = async () => {
  try {
    await pool.connect();
  } catch (err) {
    console.log(err);
  }
};
connectToDB();

function filterTasksWithSortOption(sortOption: number, results: Array<any>) {
  switch (sortOption) {
    case 1:
      return results.filter((result) => result.complete === false).sort((a, b) => a.date - b.date);
    case 2:
      return results.filter((result) => result.complete === false).sort((a, b) => (a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate - b.dueDate));
    case 3:
      return results.filter((result) => result.complete === false).sort((a, b) => b.creator.localeCompare(a.creator));
    case 4:
      return results.filter((result) => result.complete === false).sort((a, b) => a.id - b.id);
    case 5:
      return results.filter((result) => result.complete === false).sort((a, b) => a.id - b.id);
    case 6:
      return results.filter((result) => result.complete === true).sort((a, b) => a.id - b.id);
    default:
      return results;
  }
}

function filterTasksWithCreator(creator: string, results: Array<any>,) {
  if (creator === '') {
    return results
  }
  return results.filter((result) => result.creator.toLowerCase().includes(creator.toLowerCase()))
}

function filterTasksWithTime(startDate: string, endDate: string, results: Array<any>,) {
  if (startDate === '' && endDate === '') {
    return results
  }
  return results.filter((result) => new Date(result.dueDate) > new Date(startDate) && new Date(result.dueDate) < new Date(endDate))
}

//Task API
app.post('/task/getFilterTask', (req: Request, res: Response) => {
  const { searchMode, sortMode, startDate, endDate, searchString } = req.body
  pool.query('SELECT tasks.id as id, tasks.task_name as "taskName", tasks.creator_id as "creatorId", tasks.created_at as "createTime", tasks.duedate as "dueDate", tasks.complete as complete, tasks.description as description, users.username as creator, task_history.mod_time as modTime FROM tasks LEFT JOIN users ON tasks.creator_id = users.id LEFT JOIN task_history ON task_history.task_id = tasks.id ORDER BY tasks.id;', (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }

    switch (searchMode) {
      case 1:
        results.rows = filterTasksWithTime(startDate, endDate, results.rows)
        break;
      case 2:
        results.rows = filterTasksWithCreator(searchString, results.rows)
        break;
      default:
    }
    results.rows = filterTasksWithSortOption(sortMode, results.rows)

    res.status(201).send({ task: results.rows })
  })
});

app.get('/task/getAllTasks', (req: Request, res: Response) => {
  pool.query('SELECT tasks.id as id, tasks.task_name as "taskName", tasks.creator_id as "creatorId", tasks.created_at as "createTime", tasks.duedate as "dueDate", tasks.complete as complete, tasks.description as description, users.username as creator, task_history.mod_time as modTime FROM tasks LEFT JOIN users ON tasks.creator_id = users.id LEFT JOIN task_history ON task_history.task_id = tasks.id ORDER BY tasks.id;', (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ task: results.rows })
  })
});

app.post('/task/createTask', (req: Request, res: Response) => {
  const { taskName, creatorId, description } = req.body
  let dueDate = req.body.dueDate
  if (taskName === undefined || creatorId === undefined) {
    res.status(400).send(`no taskName provided`)
    return
  }
  if (dueDate === undefined) {
    dueDate = null
  }

  pool.query('INSERT INTO tasks (task_name, created_at, duedate, creator_id, complete, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [taskName, new Date(), dueDate
    , creatorId, false, description], (error, results) => {
      if (error) {
        res.status(400).send({ message: error })
        throw error
      }
      res.status(201).send({ message: 'Task added success' })
    })
});

app.put('/task/modTaskComplete', (req: Request, res: Response) => {
  const { id, complete } = req.body
  if (id === undefined) {
    res.status(400).send(`no taskId provided`)
    return
  }
  if (complete === undefined) {
    res.status(400).send(`no status provided`)
    return
  }

  pool.query('UPDATE tasks SET complete = $1 WHERE id = $2', [complete, id], (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'Task mod success' })
  })
});

app.delete('/task/deleteTask', (req: Request, res: Response) => {
  const { id } = req.body
  if (id === undefined) {
    res.status(400).send(`no taskId provided`)
    return
  }
  //delete task_history first, then delete task
  const modQuery = `DELETE FROM task_history WHERE task_id = ${id};DELETE FROM comments WHERE belong_task_id = ${id};DELETE FROM tasks WHERE id = ${id};`
  pool.query(modQuery, (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'Task delete success' })
  })
});

app.put('/task/modTask', (req: Request, res: Response) => {
  const { id, dueDate, taskName, description, complete } = req.body
  if (id === undefined) {
    res.status(400).send(`no taskId provided`)
    return
  }
  if (complete === undefined) {
    res.status(400).send(`no status provided`)
    return
  }
  if (taskName === undefined) {
    res.status(400).send(`no task name provided`)
    return
  }
  if (description === undefined) {
    res.status(400).send(`no description provided`)
    return
  }
  if (complete === undefined) {
    res.status(400).send(`no complete provided`)
    return
  }
  if (dueDate === undefined) {
    res.status(400).send(`no complete provided`)
    return
  }
  //delete old mod history, then insert new mod history, then update task
  const modQuery = `DELETE FROM  task_history where task_id = ${id};INSERT INTO task_history (task_id, task_name, created_at, duedate, creator_id, complete, description) SELECT * from tasks where id = ${id};UPDATE tasks SET task_name = '${taskName}', duedate = ` + ((dueDate === null || dueDate === '') ? 'null' : `'${dueDate}'`) + `, complete = '${complete}', description = '${description}' WHERE id = ${id};`

  pool.query(modQuery, (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'Task mod success' })
  })
});


//User API
app.get('/user/getAllUser', (req: Request, res: Response) => {
  pool.query('SELECT * FROM users;', (error, results) => {
    if (error) {
      throw error
    }
    res.status(201).send({ users: results.rows })
  })
});

app.post('/user/createUser', (req: Request, res: Response) => {
  const { username } = req.body
  if (username === undefined) {
    res.status(400).send(`no username provided`)
    return
  }

  pool.query('INSERT INTO users (username) VALUES ($1) RETURNING *', [username], (error, results) => {
    if (error) {
      throw error
    }
    res.status(201).send(`User added with ID: ${results.rows[0].id}`)
  })
});

//Comment API
app.post('/comment/getTaskComment', (req: Request, res: Response) => {
  const { taskId } = req.body
  pool.query('SELECT comments.id as id, comments.message as message, comments.created_at as "createTime", comments.belong_task_id as "belongTaskId", users.username as creator FROM comments LEFT JOIN users ON comments.creator_id = users.id WHERE comments.belong_task_id = ($1) ORDER BY comments.created_at;', [taskId], (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ comments: results.rows })
  })
});

app.post('/comment/createComment', (req: Request, res: Response) => {
  const { message, creatorId, belongTaskId } = req.body
  let dueDate = req.body.dueDate
  if (message === undefined || message === "") {
    res.status(400).send(`no taskName provided`)
    return
  }
  if (creatorId === undefined) {
    res.status(400).send(`no creatorId provided`)
    return
  }
  if (belongTaskId === undefined) {
    res.status(400).send(`no belongTaskId provided`)
    return
  }

  pool.query('INSERT INTO comments (message, creator_id, belong_task_id) VALUES ($1, $2, $3) RETURNING *', [message, creatorId, belongTaskId], (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'Comment added success' })
  })
});

app.put('/comment/modComment', (req: Request, res: Response) => {
  const { commentId, message } = req.body
  if (commentId === undefined) {
    res.status(400).send(`no commentId provided`)
    return
  }
  if (message === undefined) {
    res.status(400).send(`no message provided`)
    return
  }

  pool.query('UPDATE comments SET message = $1 WHERE id = $2', [message, commentId], (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'Comment mod success' })
  })
});

app.delete('/comment/deleteComment', (req: Request, res: Response) => {
  const { commentId } = req.body
  if (commentId === undefined) {
    res.status(400).send(`no commentId provided`)
    return
  }

  pool.query('DELETE FROM comments WHERE id = $1;', [commentId], (error, results) => {
    if (error) {
      res.status(400).send({ message: error })
      throw error
    }
    res.status(201).send({ message: 'comment delete success' })
  })
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

