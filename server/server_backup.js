require("dotenv").config();

const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const app = express();


app.use(cors({
    origin:"http://localhost:5173"
}));

app.use(express.json());



/*
=========================
LOGIN
=========================
*/


const ADMIN_USERNAME = "kerryprime";
const ADMIN_PASSWORD = "kerryprime2026";

const JWT_SECRET = "kerry_prime_secret_key_2026";



app.post("/login",(req,res)=>{


    const {username,password}=req.body;



    if(
        username === ADMIN_USERNAME &&
        password === ADMIN_PASSWORD
    ){


        const token = jwt.sign(
            {
                username:username
            },
            JWT_SECRET,
            {
                expiresIn:"24h"
            }
        );



        return res.json({

            success:true,

            token:token

        });


    }



    res.json({

        success:false,

        message:"Wrong username or password"

    });



});







/*
=========================
MARKETS
=========================
*/


const markets = {


R_10:{
    name:"Volatility 10 Index",
    digits:[]
},


R_25:{
    name:"Volatility 25 Index",
    digits:[]
},


R_50:{
    name:"Volatility 50 Index",
    digits:[]
},


R_75:{
    name:"Volatility 75 Index",
    digits:[]
},


R_100:{
    name:"Volatility 100 Index",
    digits:[]
},



"1HZ10V":{
    name:"Volatility 10 (1s)",
    digits:[]
},


"1HZ25V":{
    name:"Volatility 25 (1s)",
    digits:[]
},


"1HZ50V":{
    name:"Volatility 50 (1s)",
    digits:[]
},


"1HZ75V":{
    name:"Volatility 75 (1s)",
    digits:[]
},


"1HZ100V":{
    name:"Volatility 100 (1s)",
    digits:[]
}


};






/*
=========================
ENTRY SCANNER MEMORY
=========================
*/


const entryScanner={};



Object.keys(markets).forEach(symbol=>{


    entryScanner[symbol]={


        prediction:"WAIT",

        entryDigit:null,

        patterns:[],

        confirmations:0,

        status:"WAITING",

        collecting:false,

        buffer:[]

    };


});





let socket=null;

let currentMarket="R_100";
/*
=========================
PREDICTION ENGINE
=========================
*/


function analyzePrediction(symbol){


    const digits = markets[symbol].digits;



    if(digits.length < 20){

        return "WAIT";

    }




    let over = 0;
    let under = 0;




    digits.forEach(d=>{


        if(d > 2){

            over++;

        }



        if(d < 7){

            under++;

        }



    });





    let overPercent =
    (over / digits.length) * 100;



    let underPercent =
    (under / digits.length) * 100;





    if(overPercent >= underPercent){


        return "OVER 2";


    }

    else{


        return "UNDER 7";


    }


}









/*
=========================
ENTRY SCANNER
NEW RULE:

ENTRY DIGIT = SAFE DIGIT
THAT FAVORS THE PREDICTION

NOT THE DIGIT AFTER PREDICTION
=========================
*/


function updateEntryScanner(symbol,newDigit){



    const scanner =
    entryScanner[symbol];



    const prediction =
    analyzePrediction(symbol);



    scanner.prediction =
    prediction;





    if(prediction === "WAIT"){

        return;

    }







    /*
    FIND NEW ENTRY DIGIT

    OVER 2:
    choose digits 3-9

    UNDER 7:
    choose digits 0-6

    */


    if(scanner.entryDigit === null){



        if(prediction==="OVER 2"){



            if(newDigit > 2){



                scanner.entryDigit=newDigit;


                scanner.status="ENTRY FOUND";


                return;


            }


        }






        if(prediction==="UNDER 7"){



            if(newDigit < 7){



                scanner.entryDigit=newDigit;


                scanner.status="ENTRY FOUND";


                return;


            }


        }



    }







    /*
    WAIT FOR ENTRY DIGIT
    */


    if(
        scanner.collecting===false &&
        newDigit===scanner.entryDigit
    ){



        scanner.collecting=true;

        scanner.buffer=[];


        return;


    }







    /*
    COLLECT THREE FOLLOWING DIGITS
    */


    if(scanner.collecting){



        scanner.buffer.push(newDigit);





        if(scanner.buffer.length===3){



            let valid=true;






            scanner.buffer.forEach(d=>{





                if(prediction==="OVER 2"){



                    if(d<=2){

                        valid=false;

                    }


                }







                if(prediction==="UNDER 7"){



                    if(d>=7){

                        valid=false;

                    }


                }





            });








            if(valid){



                if(scanner.confirmations < 5){



                    scanner.patterns.push([


                        scanner.entryDigit,


                        ...scanner.buffer


                    ]);



                    scanner.confirmations++;


                }


            }







            scanner.buffer=[];

            scanner.collecting=false;









            if(scanner.confirmations===5){



                scanner.status=
                "5/5 COMPLETE - REFRESHING";





                setTimeout(()=>{



                    scanner.entryDigit=null;

                    scanner.patterns=[];

                    scanner.confirmations=0;

                    scanner.buffer=[];

                    scanner.collecting=false;


                    scanner.status=
                    "SEARCHING NEW ENTRY";



                },2000);



            }

            else{


                scanner.status=

                "CONFIRMING "

                +

                scanner.confirmations

                +

                "/5";


            }





        }



    }



}









/*
=========================
BEST MARKET SCANNER
=========================
*/


function getBestMarket(){



    let results=[];




    Object.keys(markets).forEach(symbol=>{



        const digits =
        markets[symbol].digits;




        if(digits.length < 20){

            return;

        }




        let over=0;




        digits.forEach(d=>{


            if(d>2){

                over++;

            }


        });






        let strength =
        Number(

            ((over/digits.length)*100)

            .toFixed(1)

        );





        results.push({


            symbol:symbol,


            market:
            markets[symbol].name,


            prediction:
            analyzePrediction(symbol),


            strength:strength


        });



    });





    results.sort((a,b)=>

        b.strength-a.strength

    );




    return results;



}
/*
=========================
DERIV CONNECTION
=========================
*/


function connectDeriv(){


    socket = new WebSocket(

        "wss://ws.derivws.com/websockets/v3?app_id=1089"

    );




    socket.on("open",()=>{


        console.log("Deriv connected");



        Object.keys(markets).forEach(symbol=>{


            socket.send(JSON.stringify({

                ticks:symbol,

                subscribe:1

            }));


        });


    });





    socket.on("message",(message)=>{


        const data =
        JSON.parse(message);




        if(data.tick){



            const symbol =
            data.tick.symbol;



            if(markets[symbol]){



                const digit = Number(

                    String(data.tick.quote)

                    .slice(-1)

                );





                markets[symbol].digits.push(digit);





                if(markets[symbol].digits.length > 100){


                    markets[symbol].digits.shift();


                }





                updateEntryScanner(

                    symbol,

                    digit

                );



            }


        }


    });






    socket.on("close",()=>{


        console.log("Deriv disconnected");


        setTimeout(

            connectDeriv,

            5000

        );


    });





    socket.on("error",(error)=>{


        console.log(error.message);


    });



}







/*
=========================
API ROUTES
=========================
*/


// =========================
// LIVE DIGITS API
// =========================

app.get("/digits",(req,res)=>{

    res.json({

        market: markets[currentMarket].name,

        symbol: currentMarket,

        history: markets[currentMarket].digits

    });

});



// =========================
// LIVE SIGNAL API
// =========================

app.get("/signal",(req,res)=>{


    const prediction =
    analyzePrediction(currentMarket);



    const scanner =
    entryScanner[currentMarket];



    res.json({

        market:
        markets[currentMarket].name,


        symbol:
        currentMarket,


        prediction:
        prediction,


        entryDigit:
        scanner.entryDigit,


        confirmations:
        scanner.confirmations,


        status:
        scanner.status,


        digits:
        markets[currentMarket].digits


    });


});


app.get("/digits",(req,res)=>{

    res.json({

        market: markets[currentMarket].name,

        symbol: currentMarket,

        history: markets[currentMarket].digits

    });

});



app.get("/signal",(req,res)=>{


    const prediction =
    analyzePrediction(currentMarket);



    const scanner =
    entryScanner[currentMarket];



    res.json({

        market:
        markets[currentMarket].name,


        prediction:prediction,


        entryDigit:
        scanner.entryDigit,


        confirmations:
        scanner.confirmations,


        status:
        scanner.status,


        digits:
        markets[currentMarket].digits


    });


});
app.get("/",(req,res)=>{


    res.send(

        "Kerry Prime Trading Hub Running"

    );


});







app.get("/analysis/:symbol",(req,res)=>{


    const symbol =
    req.params.symbol;



    if(!markets[symbol]){


        return res.json({

            error:"Market not found"

        });


    }





    res.json({


        market:
        markets[symbol].name,


        symbol:symbol,


        digits:
        markets[symbol].digits,


        prediction:
        analyzePrediction(symbol)



    });


});








app.get("/entry/:symbol",(req,res)=>{


    const symbol =
    req.params.symbol;




    if(!entryScanner[symbol]){


        return res.json({

            error:"Market not found"

        });


    }





    res.json({


        market:
        markets[symbol].name,


        scanner:
        entryScanner[symbol]


    });


});








app.get("/best-market",(req,res)=>{


    res.json(

        getBestMarket()

    );


});








app.get("/markets",(req,res)=>{


    res.json(

        Object.keys(markets)

    );


});








app.post("/change-market/:symbol",(req,res)=>{


    const symbol =
    req.params.symbol;




    if(markets[symbol]){


        currentMarket=symbol;



        res.json({

            success:true,

            market:
            markets[symbol].name

        });


    }

    else{


        res.json({

            success:false

        });


    }


});








/*
=========================
START SERVER
=========================
*/


app.listen(5000,()=>{


    console.log(

        "Kerry Prime Trading Hub running on port 5000"

    );


    connectDeriv();


});