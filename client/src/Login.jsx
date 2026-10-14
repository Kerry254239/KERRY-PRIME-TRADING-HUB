import { useState } from "react";


function Login({ setLoggedIn }) {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");


  async function login() {

    console.log("LOGIN BUTTON CLICKED");


    try {

      const response = await fetch(
        "http://127.0.0.1:5000/login",
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            username: username,

            password: password

          })

        }
      );


      const data = await response.json();


      console.log(data);



      if (data.success === true) {


        localStorage.setItem(
          "token",
          data.token
        );


        setLoggedIn(true);


      } else {


        setMessage(
          data.message || "Login failed"
        );


      }



    } catch (error) {


      console.log(error);


      setMessage(
        "Server connection failed"
      );


    }


  }



  return (

    <div className="login">


      <h1>
        Kerry Prime Trading Hub
      </h1>


      <h2>
        Private Access
      </h2>



      <input

        type="text"

        placeholder="Username"

        value={username}

        onChange={(e)=>
          setUsername(e.target.value)
        }

      />



      <input

        type="password"

        placeholder="Password"

        value={password}

        onChange={(e)=>
          setPassword(e.target.value)
        }

      />



      <button onClick={login}>

        LOGIN

      </button>



      <p>

        {message}

      </p>



    </div>

  );

}


export default Login;