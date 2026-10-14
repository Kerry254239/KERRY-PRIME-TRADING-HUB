import React, { useEffect, useState } from "react";


function MarketAnalyzer(){


const [running,setRunning]=useState(false);

const [market,setMarket]=useState("R_100");


const [signal,setSignal]=useState({});

const [entry,setEntry]=useState({});

const [digits,setDigits]=useState([]);

const [digitStats,setDigitStats]=useState({});


const [alert,setAlert]=useState("No Alerts");


const [bestMarket,setBestMarket]=useState("Waiting...");



const markets=[

"R_10",
"R_25",
"R_50",
"R_75",
"R_100",
"1HZ10V",
"1HZ25V",
"1HZ50V",
"1HZ75V",
"1HZ100V"

];





useEffect(()=>{


if(!running) return;



const timer=setInterval(()=>{


fetch("http://localhost:5000/signal")

.then(res=>res.json())

.then(data=>{


setSignal(data.signal || {});


setEntry(data.entry || {});


setDigitStats(data.digitStats || {});



if(
data.signal &&
data.signal.prediction &&
data.signal.prediction !== "WAIT"
){

setAlert(

"Market Direction: "

+data.signal.prediction

);

}


});





fetch("http://localhost:5000/digits")

.then(res=>res.json())

.then(data=>{


setDigits(data.digits || []);


});





},1000);



return()=>clearInterval(timer);



},[running]);







const changeMarket=async(symbol)=>{


await fetch(

`http://localhost:5000/change-market/${symbol}`,

{

method:"POST"

}

);


setMarket(symbol);


setAlert(

"Changed market to "+symbol

);


};






const resetScanner=async()=>{


await fetch(

"http://localhost:5000/reset",

{

method:"POST"

}

);


setSignal({});

setEntry({});

setDigits([]);

setDigitStats({});

setAlert("Fresh scan started");



};







const findBestMarket=()=>{


setBestMarket(

"Analyzing markets..."

);



setTimeout(()=>{


setBestMarket(

"Best Market: "+market

);


},1000);



};







return(


<div className="analyzer">


<h1>
Kerry Prime Trading Hub
</h1>



<h2>
Scanner Control
</h2>


<button onClick={()=>setRunning(true)}>

Start Scanning

</button>



<button onClick={()=>setRunning(false)}>

Stop Scanning

</button>



<button onClick={resetScanner}>

Fresh Reset

</button>




<p>

Status:

{running ? "RUNNING":"STOPPED"}

</p>







<h2>
Market Chooser
</h2>


<select

value={market}

onChange={(e)=>changeMarket(e.target.value)}

>


{

markets.map((m)=>(


<option key={m} value={m}>

{m}

</option>


))

}


</select>







<h2>
Market Alert
</h2>


<h3>
{alert}
</h3>








<h2>
Best Market Analyzer
</h2>


<button onClick={findBestMarket}>

Find Best Market

</button>


<p>

{bestMarket}

</p>







<h2>
Last Digits
</h2>


<div>


{

digits.slice(-30).map((d,i)=>(


<span key={i}>

{d} &nbsp;

</span>


))

}


</div>








<h2>
Digit Statistics
</h2>


<div>


{

Object.keys(digitStats).map((d)=>(


<p key={d}>

Digit {d}: {digitStats[d]}%

</p>


))


}


</div>








<h2>
Signal Scanner
</h2>


<p>

Status:

{signal.status}

</p>


<p>

Prediction:

{signal.prediction}

</p>


<p>

Confidence:

{signal.confidence}%

</p>


<p>

Ticks:

{signal.ticks}

</p>









<h2>
Entry Scanner
</h2>


<p>

Status:

{entry.status}

</p>


<p>

Candidates:

{entry.candidates?.join(", ")}

</p>


<p>

Entry Digit:

{entry.entryDigit}

</p>


<p>

Confirmations:

{entry.confirmations}/3

</p>







<h2>
Entry Patterns
</h2>


{

entry.patterns?.map((p,i)=>(


<p key={i}>

Pattern {i+1}: 

{p.join(" → ")}

</p>


))


}



</div>


);


}


export default MarketAnalyzer;