import { useState } from "react";


function DerivConnection() {

  const [connected, setConnected] = useState(false);


  function connectDeriv() {

    setConnected(true);

  }


  return (

    <div className="card">

      <h2>
        Deriv Connection
      </h2>


      <p>
        Status: {connected ? "Connected ✅" : "Not Connected"}
      </p>


      <button onClick={connectDeriv}>

        {connected ? "Connected" : "Connect Deriv"}

      </button>


    </div>

  );

}


export default DerivConnection;