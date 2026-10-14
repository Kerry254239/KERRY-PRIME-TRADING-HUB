require("dotenv").config();

const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const {
    createSignalScanner,
    updateSignalScanner
} = require("./signal-scanner");


const {
    createEntryScanner,
    updateEntryScanner
} = require("./entry-scanner");



const app = express();


app.use(cors());

app.use(express.json());



const PORT = 5000;



// ===============================
// CREATE SCANNERS
// ===============================


const signalScanner = createSignalScanner();

const entryScanner = createEntryScanner();





// ===============================
// MARKET DATA
// ===============================


let currentMarket = "R_100";

let lastDigits = [];

let socket;



// ===============================
// SIGNAL STATE
// ===============================


let signalActive = false;





// ===============================
// ROUTES
// ===============================


app.get("/",(req,res)=>{


    res.json({

        message:"Kerry Prime Trading Hub Running"

    });


});





app.get("/signal",(req,res)=>{


    res.json({

        signal:signalScanner,

        entry:entryScanner

    });


});






// ===============================
// DERIV CONNECTION
// ===============================


function connectDeriv(){


    socket = new WebSocket(

        "wss://ws.derivws.com/websockets/v3?app_id=1089"

    );




    socket.on("open",()=>{


        console.log("Deriv connected");



        socket.send(JSON.stringify({

            ticks:currentMarket,

            subscribe:1

        }));



    });







    socket.on("message",(message)=>{


        const data = JSON.parse(message);



        if(!data.tick){

            return;

        }




        const digit = Number(

            String(data.tick.quote).slice(-1)

        );




        lastDigits.push(digit);



        if(lastDigits.length > 200){

            lastDigits.shift();

        }





        // ===============================
        // SIGNAL SCANNER
        // ===============================



        if(!signalActive){



            updateSignalScanner(

                signalScanner,

                digit

            );




            if(signalScanner.prediction !== "WAIT"){



                signalActive=true;



                console.log(

                    "SIGNAL FOUND:",

                    signalScanner.prediction

                );



                // RESET ENTRY SCANNER

                entryScanner.status =
                "SCANNING ENTRY DIGIT";


                entryScanner.prediction =
                signalScanner.prediction;


                entryScanner.candidates=[];

                entryScanner.entryDigit=null;

                entryScanner.patterns=[];

                entryScanner.confirmations=0;



            }



        }





        // ===============================
        // ENTRY SCANNER
        // ONLY AFTER SIGNAL
        // ===============================



        if(signalActive){



            updateEntryScanner(

                entryScanner,

                signalScanner.prediction,

                digit

            );





            if(entryScanner.status==="ENTRY FOUND"){



                console.log(

                    "ENTRY FOUND:",

                    entryScanner.entryDigit

                );



                signalActive=false;



                // prepare for next signal


                setTimeout(()=>{


                    signalScanner.status =
                    "COLLECTING NEW SIGNAL";


                    signalScanner.prediction =
                    "WAIT";


                    signalScanner.history=[];


                    entryScanner.status =
                    "WAITING FOR SIGNAL";



                    entryScanner.candidates=[];



                },3000);



            }



        }



    });






    socket.on("close",()=>{


        console.log(

            "Deriv disconnected"

        );


        setTimeout(

            connectDeriv,

            5000

        );


    });





    socket.on("error",(err)=>{


        console.log(

            err.message

        );


    });



}





// ===============================
// START SERVER
// ===============================


// ===============================
// DIGITS ROUTE
// ===============================

app.get("/digits",(req,res)=>{


    res.json({

        success:true,

        market:currentMarket,

        digits:
        markets[currentMarket].digits


    });


});





// ===============================
// SIGNAL ROUTE
// ===============================

app.get("/signal",(req,res)=>{


    res.json({

        signalScanner:
        typeof signalScanner !== "undefined"
        ?
        signalScanner
        :
        null,


        entryScanner:
        typeof entryScanner !== "undefined"
        ?
        entryScanner
        :
        null


    });


});




// ===============================
// MARKET CHANGE
// ===============================

app.post("/change-market/:symbol",(req,res)=>{


    const symbol=req.params.symbol;


    currentMarket=symbol;


    digits=[];


    signal={

        status:"COLLECTING",

        prediction:"WAIT",

        confidence:0,

        ticksAnalyzed:0

    };


    entry={

        status:"WAITING FOR SIGNAL",

        prediction:"WAIT",

        candidates:[],

        entryDigit:null,

        confirmations:0,

        patterns:[]

    };



    res.json({

        success:true,

        market:currentMarket

    });


});

app.listen(PORT,()=>{


    console.log(

        "Kerry Prime Trading Hub running on port "+PORT

    );


    connectDeriv();


});