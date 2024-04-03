const http = require("http");
const fs = require("fs").promises;
const syncfs = require("fs");

//console color module
const CColor = require("./class/ConsoleColors.js");
const d = require('./class/DebugLog');

let config;
config = reloadJSON("server/config.json"); //this is done to allow fast reloading of json while the program is running.

const Excel = require("exceljs");

const server = http.createServer(requestListener);
const __rootname = __dirname.split("\\").slice(0, -1).join("\\"); //properly target the root folder

let verbose = config.verbose;
const io = require("socket.io")(server, 
    {
        cors: {
            origin: config.CORS, //allow CORS requests, so that websockets from daemons can connect
            methods: ["GET", "POST", "OPTIONS"]
          }
    });

let GUISocket, DatalogSocket;

init();

function init()
{
    
    server.listen(config.port, config.hostname, () => 
    {
        d.log(`Server is listening for http traffic on http://${config.hostname}:${config.port}/`);
    });

    //create mappings for socket.io
    io.on('connection', (socket) => 
    {
        d.log("Connection established with " + socket.id);

        socket.on("client-handshake", () => 
        {
            d.log(`Socket ${socket.id} connected.`);
            socket.emit("server-response", "connected");
        });

        socket.on("hello", (data) => 
        {
            if(!data)
            {
                socket.disconnect();
                return; //disconnect unidentified sockets
            }

            switch(data.name)
            {
                case "GUI":
                    d.log(`GUI connected, v${data.version}`);
                    GUISocket = socket;
                    GUISocket.on("disconnect", () => { d.log("GUI disconnected."); GUISocket = null;});
                break;
                case "DatalogDaemon":
                    d.log(`Datalog Daemon connected, v${data.version}`);
                    DatalogSocket = socket;
                    DatalogSocket.on("disconnect", () => { d.log("Datalog Daemon disconnected."); DatalogSocket = null;});
                break;
            }
        });

        socket.on("SEMS-export", () =>
        {
            reloadJSON();
            TicketExport();
        });

        socket.on("rsd-cfd", () =>
        {
            reloadJSON();
            RSDCFD();
        });

        socket.on("half8email", () =>
        {
            reloadJSON();
            Broadcast("half8email <span style='color:#b5f19c'>received</span>, processing...")
            Half8Email();
        });

        socket.on("client-broadcast", (bt) =>
        {
            Broadcast("CLIENT: " + bt);
        });

        //for simplicity, commands that are routed to the API start with /

        socket.on("/todos", () =>
        {
            GUISocket.emit("broadcast", "API: /todos"); //tell the GUI client what we're sending
            //the DHL-API-Post function will send a POST request to the API, which is encapsulated as a Promise.
            DHLAPIPost("/todos", {})
                .then((b) => GUISocket.emit("broadcast", "API RESP: " + JSON.parse(b).body))
                .catch(e => {GUISocket.emit("broadcast", "API ERROR: " + e)});
        });
        socket.on("/api/status", () =>
        {
            GUISocket.emit("broadcast", "API: /api/status");
            DHLAPIPost("/api/status", {})
                .then((b) => GUISocket.emit("broadcast", "API RESP: " + JSON.parse(b).body))
                .catch(e => {GUISocket.emit("broadcast", "API ERROR: " + e)});
        });
        socket.on("/api/con/lastscan", (con) =>
        {
            GUISocket.emit("broadcast", "API: /api/con/lastscan, " + con);
            DHLAPIPost("/api/con/lastscan", {body:con})
                .then((b) => {GUISocket.emit("broadcast", "API RESP: " + JSON.stringify(JSON.parse(b).body)); d.log(b)})
                .catch(e => {GUISocket.emit("broadcast", "API ERROR: " + e)});
        });
        socket.on("/api/con/lastscanbulk", (conArray) =>
        {
            GUISocket.emit("broadcast", "API: /api/con/lastscanbulk");
            DHLAPIPost("/api/con/lastscanbulk", {body:conArray}).then((b) => 
            {
                //We want to generate reports that are pleasant to view but also useful; to that end, 
                //both a web grid view of the API results, as well as a generated CSV sheet. 

                //for debug, caching, and reference purposes, all files processed are kept on disk.
                //they are not particularly large, therefore should not cause space issues.

                //this is by and large the most sensitive part of the code, relying on API code as well 
                //as network conditions to function properly.

                let currentTime = time(true);

                let csvFile = currentTime + ".csv";
                let htmlFile = currentTime + ".html";
                let htmlArray = JSON.parse(b).html;
                let bodyData = JSON.parse(b).body;
                let consignments = conArray.split('\n');

                let csvLink = `<a target="_blank" href="http://${config.hostname}:${config.port}/scan/${currentTime}/${csvFile}" download="${csvFile}">${csvFile}</a>`;
                let htmlLink = `<a target="_blank" href="http://${config.hostname}:${config.port}/scan/${currentTime}/${htmlFile}">${htmlFile}</a>`;

                //the strategy here revolves around the HTML file self-assembling on load with the JS scripts provided.
                let t = String(syncfs.readFileSync("public/res/lastScanResultTemplate.html"));
                t = t.replace("!!TITLE", htmlFile);
                t = t.replace("!!A", csvLink);
                t = t.replace("!!DATA", bodyData);

                syncfs.mkdirSync(`public/scan/${currentTime}/`);
                syncfs.mkdirSync(`public/scan/${currentTime}/cons/`);

                //https://xkcd.com/2200/
                syncfs.writeFileSync(`public/scan/${currentTime}/` + csvFile, bodyData ? bodyData : "womp womp");
                syncfs.writeFileSync(`public/scan/${currentTime}/` + htmlFile, t ? t : "womp womp");

                for(let i in htmlArray)
                {
                    syncfs.writeFileSync(`public/scan/${currentTime}/cons/` + consignments[i] + ".html", htmlArray[i] ? htmlArray[i] : "womp womp");
                }

                socket.emit("broadcast", `API RESP: ${htmlLink}<br>${csvLink}`);
            }).catch(e => {socket.emit("broadcast", "API ERROR: " + e)}); //generic error handling.
                
        });

    });

    //this function ensures the file structure is intact (so we do not end up with FileNotFound crashes)
    initFilestructure();

    //N.B.: Put a function here to test it on boot - 
    try
    {
        //RSDCFD();
    }
    catch
    {
        d.log("Boot Test Function crashed!");
    }
}


function requestListener(req, res)
{
    //if verbose logging is enabled we want to log each request made.
    if (verbose) Broadcast(`req: ${req.url}`);

    var uri = translateURI(req.url);

    fs.readFile(uri).then((contents) =>
    {
        res.writeHead(200);

        res.end(contents);
    })
    .catch((e) => 
    {        
        res.writeHead(500); //generic error handling.
        res.end(e.toString());
    });
}

/**
 * Reloads the program configuration from the path provided.
 * @param {string} path If none is provided, defaults to config.json
 */
function reloadJSON(path)
{
    path = path == undefined ? "server/config.json" : path;

    let temp = JSON.parse(require("fs").readFileSync(path, 'utf8'));
    config = temp;
    return temp;
}

function translateURI(url)
{
    if(url == "/")
        return __rootname + "\\public\\index.html";
        
    return __rootname + "\\public" + url;
}

function initFilestructure()
{
    ["SEMS Export", "Half 8", "RSDCFD"]
        .forEach((child) => { fs.mkdir(`OPERATIONS/${child}/`).catch(()=>{}) });
}

/**
 * Sends a string to the GUI client as a broadcast while also logging it in the system console.
 * @param {string} text2br Text to broadcast.
 */
function Broadcast(text2br)
{
    try
    {
        GUISocket.emit("broadcast", text2br);
        d.log(text2br);
    }
    catch (err)
    {
        d.log(`Failed Broadcast: ${text2br}`);
    }
    return;
}

//shorthand for Broadcast
function Say(t) { Broadcast(t); }

/**
 * Function that loads all applicable excel files in the SEMSExport directory, combines them, and filters out the unassigned tickets.
 * Subsequently it saves the resulting excel file in the same directory.
 */
async function TicketExport()
{
    //here, we will be combining multiple workbooks together into one new one. 
    const outputWB = new Excel.Workbook(); //create a blank WB we will be using as output.
    outputWB.addWorksheet("DATA");
    outputWB.addWorksheet("SEMS");

    reloadJSON();

    //collect the names of all workbooks that do not contain "SEMS" in the filename.
    //this is to ensure we do not load in any workbooks that are outputs of the program.
    var fileListRaw = await fs.readdir("OPERATIONS/SEMS Export/"), fileList = [];
    
    for(let i = 0; i < fileListRaw.length; i++)
    {
        if(!fileListRaw[i].toLowerCase().includes("sems"))
            fileList.push("OPERATIONS/SEMS Export/" + fileListRaw[i]);
    }

    if(fileList.length == 0)
    {
        try
        {
            GUISocket.emit("broadcast", `There are no valid files to operate on.`);
        }
        catch (err)
        {
             if (verbose) Broadcast("Failed Broadcast");
        }
        return;
    }

    try
    {
        GUISocket.emit("broadcast", "Starting export...");
    }
    catch (err)
    {
         if (verbose) Broadcast("Failed Broadcast");
    }


    var workbookList = [], userCol, ageCol;

    for(let i = 0; i < fileList.length; i++)
    {
        workbookList.push(new Excel.Workbook());

        var sizeColorString = "";
        var size = Math.ceil(require("fs").statSync(fileList[i]).size / 1024);
        if(size < 100)
            sizeColorString = `(<span style='color:#b5f19c'>${size} KB</span>)`;
        else if (size < 500)
            sizeColorString = `(<span style='color:#FFA500'>${size} KB</span>)`;
        else
            sizeColorString = `(<span style='color:#FF0000'>${size} KB</span>)`;
        Say(`Loading '${fileList[i].split('/')[fileList[i].split('/').length - 1]}' ${sizeColorString}...`);

        await workbookList[workbookList.length -1].xlsx.readFile(fileList[i]);
    }

    //at this point in the program, all our sheets are loaded in. We can start the actual counting and import/export.

    for(let i = 0; i < workbookList.length; i++)
    {
        //loop through all workbooks
        for(let row = 1; row <= workbookList[i].worksheets[0].lastRow._number ; row++)
        {
            
            if(i > 0 && row == 1)
                continue;

            var cells = [];
            for(let c = 0; c < workbookList[i].worksheets[0].getRow(row)._cells.length; c++)
            {
                var v = workbookList[i].worksheets[0].getRow(row)._cells[c].value;
                cells.push(v);
                if (v == "Assigned to User")
                    userCol = c + 1;
                if(v == "Action age")
                    ageCol = c + 1;
            }

            outputWB.getWorksheet("SEMS").addRow(cells);
        }
    }

    var totalCount = 0, unassignedCount = 0, oldestAge = 0;
    
    //1 for header, and 1 for zero based indexing.
    totalCount = outputWB.getWorksheet("SEMS").getColumn(userCol).values.length - 2;

    //for each unassigned cell
    outputWB.getWorksheet("SEMS").getColumn(userCol).eachCell((cell, no) => {if (cell.value == "")
    { 
        unassignedCount++; 

        var ageCell = outputWB.getWorksheet("SEMS").getColumn(ageCol).values[no];

        var cVal = Number(ageCell.replace(":", "").replace(":", ""));
        oldestAge = Math.max(cVal, oldestAge);
        
    }});

    //copy the header
    outputWB.getWorksheet("DATA").addRow(outputWB.getWorksheet("SEMS").getRow(1).values);

    //clone the unassigned records to the DATA sheet
    outputWB.getWorksheet("SEMS").getColumn(userCol).eachCell((cell, no) => 
    {
        if(cell.value == "")
        {
            outputWB.getWorksheet("DATA").addRow(outputWB.getWorksheet("SEMS").getRow(no).values);
        }
    });

    //we will need to assign names from the list
    let rr = [" "];
    for(let i = 2; i <= outputWB.getWorksheet("DATA").lastRow._number; i++)
    {
        rr.push(config.SEMSExport.names[(i - 2) % config.SEMSExport.names.length]); //iterate through the rows
        outputWB.getWorksheet("DATA").getColumn(userCol).values = rr;
    }

    //copy the header again, this fixes the header.
    outputWB.getWorksheet("DATA").getRow(1).values = outputWB.getWorksheet("SEMS").getRow(1).values;

    let oldestAgeString = "";


    //this will 'fix' date formatting such that the output is actually human readable.
    let minutes = oldestAge % 100;
    let hours = oldestAge % 10000 - minutes == 0 ? "00" : oldestAge % 10000 - minutes;
    let days = oldestAge - hours - minutes == 0 ? "00" : oldestAge - hours - minutes;

    hours = hours == "00" ? "00" : hours / 100;
    days = days == "00" ? "00" : days / 10000;

    String(days).padStart(2, "0");
    String(hours).padStart(2, "0");
    String(minutes).padStart(2, "0");

    oldestAgeString = `${days}:${hours}:${minutes}`;

    let today = new Date();


    //autosize the columns
    outputWB.getWorksheet("DATA").columns.forEach((column, i) => 
    {
        let maxLength = 0;
        column["eachCell"]({ includeEmpty: true }, (cell) =>
        {
            var columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength ) 
            {
                maxLength = columnLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength;
    });

    //write the file!
    await outputWB.xlsx.writeFile(`OPERATIONS/SEMS Export/SEMS ${`${today.getDate()}`.padStart(2, "0")}.${`${today.getMonth() + 1}`.padStart(2, "0")}.xlsx`);

    try
    {
        GUISocket.emit("broadcast", `Good morning! Total SEMS: ${totalCount}, Unassigned: ${unassignedCount}, Oldest Unassigned Age: ${oldestAgeString}`);
    }
    catch (err)
    {
        d.log("Failed Broadcast");
    }
}

async function RSDCFD()
{//the big boy!

    //operating this function:
    //Place RSD & CFD files in the RSDCFD folder

    //TODO: add weekend sheet support

    //RSD: this file will contain "RSD" somewhere in its filename
    //CFD will be containing "CFD"

    //get the list of all files
    var fileListRaw = await fs.readdir("OPERATIONS/RSDCFD/"), RSDCFDFilePath = "", CFDFilePath = "";

    fileListRaw.forEach((element) => 
    {
        if(element.toLowerCase().includes("rsd"))
        {
            RSDCFDFilePath = element;
        }

        if(element.toLowerCase().includes("cfd"))
        {
            CFDFilePath = element;
        }
    });

    let CFDNotPresent = false;

    if( RSDCFDFilePath == "")
    {
        Broadcast("Cannot find RSD file.");
        return;
    }
    else if ( CFDFilePath == "")
    {//due to the nature of this report, if no CFD is found, we just proceed without it.
        CFDNotPresent = true;
        Broadcast("Cannot find CFD file. Proceeding without it...");
        Broadcast(`RSD: ${RSDCFDFilePath}`);
    }
    else
        Broadcast(`RSD: ${RSDCFDFilePath}<br>CFD: ${CFDFilePath}`);

    //--------------------------------------------------------------------------------------------------------

    var sizeColorString = "";

    var size = Math.ceil(require("fs").statSync("OPERATIONS/RSDCFD/" + RSDCFDFilePath).size / 1024);
    if(size < 100)
        sizeColorString = `(<span style='color:#b5f19c'>${size} KB</span>)`;
    else if (size < 500)
        sizeColorString = `(<span style='color:#FFA500'>${size} KB</span>)`;
    else
        sizeColorString = `(<span style='color:#FF0000'>${size} KB</span>)`;
    Say(`Loading '${RSDCFDFilePath}' ${sizeColorString}...`);

    let RSDCFDFileName = RSDCFDFilePath;

    RSDCFDFilePath = "OPERATIONS/RSDCFD/" + RSDCFDFilePath;

    //this will be the output file
    const outputRSD = new Excel.Workbook();
    outputRSD.addWorksheet("RSDCFD");

    //this will be the output CSV file - ready to for bulk uploads into the mainframe.
    const outputStatuscode = await new Excel.Workbook();

    const RSD = await new Excel.Workbook().xlsx.readFile(RSDCFDFilePath);

    //--------------------------------------------------------------------------------------------------------
    let CFD;
    if(!CFDNotPresent) //we dont want to attempt loading this if the file is not provided.
    {
        sizeColorString = "";
        size = Math.ceil(require("fs").statSync("OPERATIONS/RSDCFD/" + CFDFilePath).size / 1024);
        if(size < 100)
            sizeColorString = `(<span style='color:#b5f19c'>${size} KB</span>)`;
        else if (size < 500)
            sizeColorString = `(<span style='color:#FFA500'>${size} KB</span>)`;
        else
            sizeColorString = `(<span style='color:#FF0000'>${size} KB</span>)`;
        Say(`Loading '${CFDFilePath}' ${sizeColorString}...`);
    
        CFDFilePath = "OPERATIONS/RSDCFD/" + CFDFilePath;
    
        CFD = await new Excel.Workbook().xlsx.readFile(CFDFilePath);
    }

    //--------------------------------------------------------------------------------------------------------

    //array of json objects representing each a row of the statuscode starting at row 1
    let statuscodeJson = [];

    statuscodeJson.push({OrderNo: "Order No", Date: "Date", Time: "Time", EventCode: "Event Code", Town: "Town", Country: "Country", PODName: "POD Name", SendRevisedETA: "Send Revised ETA", RevisedETA: "Revised ETA"});

    let RSDSheet;
    RSD.worksheets.forEach(sheet => 
    {
        if (sheet.name.toLowerCase().includes("dell")) //data for Dell is provided, but we do not care about this.
            RSD.removeWorksheet(sheet.id);
        else if (sheet.name.toLowerCase().includes("apple")) //there should only ever be apple, but prudence pays.
            RSDSheet = sheet;
    });

    if(!CFDNotPresent) //we dont want to attempt merging this if the file is not provided.
    {
        let CFDSheet;
        CFD.worksheets.forEach(sheet =>
        {
            if (sheet.name.toLowerCase().includes("dell"))
                CFD.removeWorksheet(sheet.id);
            else if (sheet.name.toLowerCase().includes("apple"))
                CFDSheet = sheet;
        })
    
        //this part adds everything we find in the sheet in CFD to the sheet in RSD
        for(let row = 2; row <= CFDSheet.lastRow._number; row++)
        {//looping through all rows in CFD
            let cfdrow = [];
            CFDSheet.getRow(row).eachCell({includeEmpty: true}, (cell) =>
            {
                cfdrow.push(cell.value);
            })
            await RSDSheet.addRow(cfdrow).commit(); //i guess
        }
    }

    let failflag = false, Con, Dn, CollectionDate, RescheduleDate, RescheduleType, RescheduleTransactionDate, RescheduleDetails;

    //find rows (as row indexes are unreliable and depend on who is doing the report at DHL)
    RSDSheet.getRow(1).eachCell((cell, colNumber) =>
    {
        switch(cell.value)
        {
            case "ConsignmentNumber":
                Con = colNumber;
            break;
            case "OrderRef":
                Dn = colNumber;
            break;
            case "CollectionDate":
                CollectionDate = colNumber;
            break;
            case "RescheduleDate":
                RescheduleDate = colNumber;
            break;
            case "ReschduleType":
                RescheduleType = colNumber;
            break;
            case "RescheduleTransactionDate":
                RescheduleTransactionDate = colNumber;
            break;
            case "RescheduleDetails":
                RescheduleDetails = colNumber;
            break;
        }
    });

    //Data validation
    //Its quite complex and longwinded, essentially we want to collect ALL errors and display them one by one.
    //Due to humans doing this report, it can be plagued with errors and oversights.

    //Since I also will not be reviewing this data unless the program flags it as erroneous, prudence really pays.
    RSDSheet.eachRow((row, rowNumber) =>
    {
        if(rowNumber < 2)   //skip the heading - already processed
            return;

        //we can check if the cell is a formula by checking if(row.cell.value.formula) for dumb stuff like ="bruh"
        row.eachCell((cell, colNumber) =>
        {
            if(cell.value.formula)
                cell.value = cell.value.result; //and we remove the formula
        })
        
        if(row.getCell(Dn).value == null)   //if it is empty
        {
            Broadcast(`DN is empty on line ${rowNumber}.`);
            failflag = true;
        }

        else if(row.getCell(Dn).value.toString().length < 10) //if it's too long (bad data)
        {
            Broadcast(`DN is invalid on line ${rowNumber}.`);
            failflag = true;
        }

        else if(row.getCell(RescheduleType).value == null)
        {
            Broadcast(`RescheduleType is empty on line ${rowNumber}.`);
            failflag = true;
        }


        //check if dates are within 15 days of today
        //this is for when they dont check their export and just give us a bad date like  1 Jan 2000
        let oldDate = new Date(new Date().setDate(new Date().getDate() - 15));  //15 days each way is enough
        let newDate = new Date(new Date().setDate(new Date().getDate() + 15));

        if(row.getCell(CollectionDate).value < oldDate)
        {
            Broadcast(`CollectionDate is older than 15 days on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleDate).value < oldDate)
        {
            Broadcast(`RescheduleDate is older than 15 days on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleTransactionDate).value < oldDate)
        {
            Broadcast(`RescheduleTransactionDate is older than 15 days on line ${rowNumber}.`);
            failflag = true;
        }

        if(row.getCell(CollectionDate).value > newDate)
        {
            Broadcast(`CollectionDate is further than 15 days in the future on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleDate).value > newDate)
        {
            Broadcast(`RescheduleDate is further than 15 days in the future on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleTransactionDate).value > newDate)
        {
            Broadcast(`RescheduleTransactionDate is further than 15 days in the future on line ${rowNumber}.`);
            failflag = true;
        }

        //there is a LOT of repetition here. Designing this to be fool-proof was exceedingly time-consuming
        //but I believe to have figured it out now.

        if(row.getCell(CollectionDate).value.toString().toLowerCase().includes("customer") || row.getCell(CollectionDate).value.toString().toLowerCase().includes("leave"))
        {
            Broadcast(`CollectionDate contains invalid data on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleDate).value.toString().toLowerCase().includes("customer") || row.getCell(RescheduleDate).value.toString().toLowerCase().includes("leave"))
        {
            Broadcast(`RescheduleDate contains invalid data on line ${rowNumber}.`);
            failflag = true;
        }
        if(row.getCell(RescheduleTransactionDate).value.toString().toLowerCase().includes("customer") || row.getCell(RescheduleTransactionDate).value.toString().toLowerCase().includes("leave"))
        {
            Broadcast(`RescheduleTransactionDate contains invalid data on line ${rowNumber}.`);
            failflag = true;
        }      

        if(row.getCell(RescheduleDetails).value != null && 
        (!row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("rsd") && !row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("customer will collect") && !row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("leave safe")))
        {
            Broadcast(`Invalid RescheduleDetails entered on line ${rowNumber}.`);
            failflag = true;
        }

    });

    if(failflag)
    {//exit if the fail has been tripped
        if (verbose) Broadcast("FailFlag tripped. Exiting..");
        return;
    }

    //before we start with the main flowchart, we need to set up the date engine
    //it is possible to set this up programmatically, but after experimenting, I can see that this takes longer than 
    //just manually setting date offsets.

    let today, tomorrow = [], yesterday = [], twoDatesBack = [], 
    after = { date: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), direction: "after" }, 
    before = { date: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), direction: "before" }, 
    dayAfter = { date: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1), direction: "after" };

    //the program must treat each day as an array of applicable dates, this is because weekends can sometimes (but not always)
    //be treated as a single day (for the purposes of counting)

    //populate the dates
    today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    let todayAmended = [today]; //because of the way we handle dates, this structure comes in 'handy'.

    switch(today.getDay())
    {//so absolutely hilariously, if the order in question is on a saturday delivery service, we should technically treat the 
     //Saturday its due on as a separate day, which would mean an almost total rewrite of this date engine.

     //this was a bug that I discovered months after writing this code, because the edge case is so rare it never happened outside of test data.



     //also, future me, trust me that this really was the simplest way to make this. I could have likely
     //shortened down the individual expressions of today.getFullYear() etc. into variables...

        case 1://monday
            yesterday.push(
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3) /* friday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* saturday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* sunday */
            );
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4) /* thursday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* tuesday */)
        break;

        case 2://tuesday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* monday */);
            twoDatesBack.push(
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4) /* friday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3) /* saturday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* sunday */
            );
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* wednesday */);
        break;

        case 3://wednesday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* tuesday */);
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* monday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* thursday */);
        break;

        case 4://thursday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* wednesday */);
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* tuesday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* friday */);
        break;

        case 5://friday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* thursday */);
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* wednesday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3) /* monday */);

            todayAmended = [];
            todayAmended.push(
                new Date(today.getFullYear(), today.getMonth(), today.getDate()) /* friday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* saturday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2) /* sunday */
            );
        break;

        case 6://saturday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* thursday */);
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3) /* wednesday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2) /* monday */);

            todayAmended = [];
            todayAmended.push(
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* friday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate()) /* saturday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* sunday */
            );
        break;

        case 0://sunday
            yesterday.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3) /* thursday */);
            twoDatesBack.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4) /* wednesday */);
            tomorrow.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) /* monday */);

            todayAmended = [];
            todayAmended.push(
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2) /* friday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) /* saturday */,
                new Date(today.getFullYear(), today.getMonth(), today.getDate()) /* sunday */
            );
        break;

        //this code is complete with handling of illogical cases like running this on a Sunday :]
        //that implies I'm at work on Sunday, and so is DHL staff :P
            
    }

    function checkTheDate(dateToQuery, dateToCheck)
    {   //imagine like checkTheDate(row.date, today) == true;, i.e. check the day of this row is 'today' using the custom
        //datatype we created in the previous step

        //this is for lovely cases of Daylight Savings and/or GMT/Summer Time differences.
        dateToQuery = new Date(dateToQuery.getFullYear(), dateToQuery.getMonth(), dateToQuery.getDate(), 0, 0, 0);

        if(dateToCheck.direction) //if the date datatype has a direction, it means the span is infinite
        {
            if(dateToCheck.direction == "after")
            {//is dQuery >= dCheck.date?
                //remove timezones
                dateToCheck.date.setHours(0,0,0);
                dateToQuery.setHours(0,0,0);

                if(dateToQuery.getTime() >= dateToCheck.date.getTime())
                    return true;
                else
                    return false;
            }
            else if (dateToCheck.direction == "before");
            {
                dateToCheck.date.setHours(0,0,0);
                dateToQuery.setHours(0,0,0);

                if(dateToQuery.getTime() <= dateToCheck.date.getTime())
                    return true;
                else
                    return false;
            }
        }
        else
        {//the span is not infinite (but may still be of multiple days length) i.e. "any of the days in the following [...a].."

            if(dateToCheck.length)
                for(let i = 0; i < dateToCheck.length; i++)
                {
                    dateToCheck[i].setHours(0,0,0);
                    dateToQuery.setHours(0,0,0);

                    if (dateToQuery.getTime() == dateToCheck[i].getTime())
                    {
                        return true;
                    }

                }
            else
            {//we were passed a single date.
                dateToCheck.setHours(0,0,0);
                dateToQuery.setHours(0,0,0);

                if (dateToQuery.getTime() == dateToCheck.getTime())
                {
                    return true;
                }
            }

            return false;
        }

    }
    
    //With this glorious amount of setup complete, enter the star of the show:
    //the main flowchart!
    RSDSheet.eachRow({includeEmpty: true},(row, rowNumber) =>
    {
        if(rowNumber < 2)   //skip the heading - already processed
            return;

        var extraCell = row.getCell("N"); //this is beyond the length of the  report

        if(!row.getCell(RescheduleDetails).value && row.getCell(RescheduleType).value.toString().toLowerCase().includes("local parcel shop"))
        {
            //local parcel shop / DHL - add nothing to Statuscode
            if (verbose) Broadcast(`${rowNumber}: DHL/LPS`);
            extraCell.value = "DHL/LPS";
            return;
        }

        if(row.getCell(RescheduleDetails).value && row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("customer will collect"))
        {
            //Customer Will collect / Z95
            if (verbose) Broadcast(`${rowNumber}: Z95`);
            extraCell.value = "Z95";

            let dat = row.getCell(RescheduleTransactionDate).value;
            let rdat = row.getCell(RescheduleDate).value;

            row.getCell(RescheduleDate).value = "Customer Will Collect";

            statuscodeJson.push({
                OrderNo: row.getCell(Dn).value,
                Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                EventCode: "Z95",
                Town: "-",
                Country: "GB",
                PODName: "",
                SendRevisedETA: "Yes",
                RevisedETA: `${rdat.getDate()}/${rdat.getMonth() + 1}/${rdat.getFullYear()}`});
            
            return;
        }

        if(row.getCell(RescheduleDetails).value && row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("rsd: leave with neighbour"))
        {
            //DNA

            let dat = row.getCell(RescheduleTransactionDate).value;
            let rdat = row.getCell(RescheduleDate).value;

            if(checkTheDate(new Date(row.getCell(CollectionDate)), yesterday) && checkTheDate(new Date(row.getCell(RescheduleDate)), today))
            {
                if (verbose) Broadcast(`${rowNumber}: DNA/COPY`);
                extraCell.value = "DNA/COPY";
                row.getCell(RescheduleDate).value = "RSD: Leave With Neighbour";
    
                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "DNA",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "No",
                    RevisedETA: ``});
                    //this looks like python, jesus

            }
            else if (checkTheDate(new Date(row.getCell(RescheduleDate)), after))
            {
                if (verbose) Broadcast(`${rowNumber}: DNA/Z81`);
                extraCell.value = "DNA/Z81";

                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "DNA",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "No",
                    RevisedETA: ``});

                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "Z81",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "Yes",
                    RevisedETA: `${rdat.getDate()}/${rdat.getMonth() + 1}/${rdat.getFullYear()}`});
            }
            else
            {
                if (verbose) Broadcast(`${rowNumber}: DNA`);
                extraCell.value = "DNA";

                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "DNA",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "No",
                    RevisedETA: ``});
            }

            return;
        }

        if(!row.getCell(RescheduleDetails).value || row.getCell(RescheduleDetails).value.toString().toLowerCase().includes("leave safe"))
        {   //Blanks

            let dat = row.getCell(RescheduleTransactionDate).value;
            let rdat = row.getCell(RescheduleDate).value;
            let rsdtd = new Date(JSON.stringify(row.getCell(RescheduleTransactionDate).value).split('T')[0].split("\"")[1]);

            if(checkTheDate(new Date(row.getCell(CollectionDate)), yesterday))
            {
                if (checkTheDate(new Date(row.getCell(RescheduleDate)), dayAfter))
                {
                    //Z81
                    if (verbose) Broadcast(`${rowNumber}: Z81`);
                    extraCell.value = "Z81";

                    statuscodeJson.push({
                        OrderNo: row.getCell(Dn).value,
                        Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                        Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                        EventCode: "Z81",
                        Town: "-",
                        Country: "GB",
                        PODName: "",
                        SendRevisedETA: "Yes",
                        RevisedETA: `${rdat.getDate()}/${rdat.getMonth() + 1}/${rdat.getFullYear()}`});
                }
                else
                {
                    //LSA, COPY
                    if (verbose) Broadcast(`${rowNumber}: LSA/COPY`);
                    extraCell.value = "LSA/COPY";
                    row.getCell(RescheduleDate).value = "Leave Safe";
                    row.getCell(RescheduleDetails).value = "Leave Safe";

                    statuscodeJson.push({
                        OrderNo: row.getCell(Dn).value,
                        Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                        Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                        EventCode: "LSA",
                        Town: "-",
                        Country: "GB",
                        PODName: "",
                        SendRevisedETA: "No",
                        RevisedETA: ``});
                }
            }
            else if (checkTheDate(new Date(row.getCell(CollectionDate)), twoDatesBack))
            {
                if (checkTheDate(new Date(row.getCell(RescheduleDate)), yesterday))
                {
                    //LSA
                    if (verbose) Broadcast(`${rowNumber}: LSA`);
                    extraCell.value = "LSA";
                    row.getCell(RescheduleDetails).value = "Leave Safe";

                    statuscodeJson.push({
                        OrderNo: row.getCell(Dn).value,
                        Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                        Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                        EventCode: "LSA",
                        Town: "-",
                        Country: "GB",
                        PODName: "",
                        SendRevisedETA: "No",
                        RevisedETA: ``});
                }
                else if (checkTheDate(new Date(row.getCell(RescheduleDate)), rsdtd))
                {
                    //LSA, COPY
                    if (verbose) Broadcast(`${rowNumber}: LSA/COPY`);
                    extraCell.value = "LSA/COPY";
                    row.getCell(RescheduleDetails).value = "Leave Safe";
                    row.getCell(RescheduleDate).value = "Leave Safe";

                    statuscodeJson.push({
                        OrderNo: row.getCell(Dn).value,
                        Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                        Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                        EventCode: "LSA",
                        Town: "-",
                        Country: "GB",
                        PODName: "",
                        SendRevisedETA: "No",
                        RevisedETA: ``});
                }
                else
                {
                    //Z81
                    if (verbose) Broadcast(`${rowNumber}: Z81`);
                    extraCell.value = "Z81";

                    statuscodeJson.push({
                        OrderNo: row.getCell(Dn).value,
                        Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                        Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                        EventCode: "Z81",
                        Town: "-",
                        Country: "GB",
                        PODName: "",
                        SendRevisedETA: "Yes",
                        RevisedETA: `${rdat.getDate()}/${rdat.getMonth() + 1}/${rdat.getFullYear()}`});
                }
            }
            else if (checkTheDate(new Date(row.getCell(RescheduleDate)), rsdtd))
            {
                //Late LSA ??????
                if (verbose) Broadcast(`${rowNumber}: LSA`);
                extraCell.value = "LSA";
                row.getCell(RescheduleDetails).value = "Leave Safe";

                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "LSA",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "No",
                    RevisedETA: ``});
            }
            else
            {
                //Z81 ???????????
                if (verbose) Broadcast(`${rowNumber}: Z81`);
                extraCell.value = "Z81";

                statuscodeJson.push({
                    OrderNo: row.getCell(Dn).value,
                    Date: `${dat.getDate()}/${dat.getMonth() + 1}/${dat.getFullYear()}`,
                    Time: `${dat.getUTCHours()}:${dat.getMinutes()}`,
                    EventCode: "Z81",
                    Town: "-",
                    Country: "GB",
                    PODName: "",
                    SendRevisedETA: "Yes",
                    RevisedETA: `${rdat.getDate()}/${rdat.getMonth() + 1}/${rdat.getFullYear()}`});
            }

            return;
        }

        //https://xkcd.com/2200/
        Broadcast(`============== Straggler on line ${rowNumber} ==============`);
        
    });

    outputStatuscode.addWorksheet("sheet");

    statuscodeJson.forEach(element =>
    {
        outputStatuscode.getWorksheet("sheet").addRow(Object.values(element));
    });

    //this function has to output 2 files:
    //- compiled RSD file for manual update to Collections file - we're working on that manuel part
    //- raw statuscode.csv for bulk uploads, need to add towns from list query

    let todayForFile = new Date();

    let csvFileName = `OPERATIONS/RSDCFD/${String(todayForFile.getDate()).padStart(2, '0')}.${String(todayForFile.getMonth() + 1).padStart(2, '0')}.${String(todayForFile.getFullYear()).padStart(4, '0')}.statuscode.csv`;
    await outputStatuscode.csv.writeFile(csvFileName);
    Broadcast(`Updated '${csvFileName}'!`);

    await RSD.xlsx.writeFile(RSDCFDFilePath);
    Broadcast(`Updated '${RSDCFDFileName}'!`);

    //personal reminder to self
    Broadcast(`<span style='color:#FFA500'>Please remember to complete the town fields.</span>`);

    //The function is complete.
    return;
}

async function Half8Email()
{
    //this is a (relatively) simple procedure that will count shipped volume of packages for a set of given days.
    //a major difference here is that this report is machine-generated, so we do not have to account for any human element.

    var fileList = await fs.readdir("OPERATIONS/Half 8/");
    var pathShippedReport, shippedVolume = 0, LU10 = 0, UTL = 0, saturdayVol = 0; 

    fileList.forEach((e) => 
    {
        if(e.toLowerCase().includes("shippedreport"))
        {
            pathShippedReport = e; 
        }
    });

    if(fileList.length <= 0 || !pathShippedReport)
    {
        Broadcast("No files provided.");
        return;
    }

    var sizeColorString = "";

    var size = Math.ceil(require("fs").statSync(`OPERATIONS/Half 8/${pathShippedReport}`).size / 1024);
    if(size < 100)
        sizeColorString = `(<span style='color:#b5f19c'>${size} KB</span>)`;
    else if (size < 500)
        sizeColorString = `(<span style='color:#FFA500'>${size} KB</span>)`;
    else
        sizeColorString = `(<span style='color:#FF0000'>${size} KB</span>)`;

    Say(`Loading '${pathShippedReport}' ${sizeColorString}...`);

    const shippedreport = new Excel.Workbook();
    await shippedreport.csv.readFile(`OPERATIONS/Half 8/${pathShippedReport}`); //load shipped report in

    Say("Sheet loaded. Starting proc loop...");

    var today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()); //date around
    var isTodayMonday = (today.getDay() == 1);
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1); //paying homage to the RSDCFD function :D
    var itsFriday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3);
    var itsSaturday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);

    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    //check whether to run the report in daily mode or weekend mode:
    if(!isTodayMonday)
    {
        //we do not have to account for human error because this report is machine-generated.
        var BUArray = Array.from(shippedreport.worksheets[0].getColumn('BU').values);

        d.log(BUArray.length, BUArray);

        for(let rowNum = 0; rowNum < BUArray.length; rowNum++)
        {

            if(rowNum <= 1)
                continue;

            shippedVolume++;
            if(BUArray[rowNum] == 'LU10')
                LU10++;
            else
                UTL++;
        }

        Broadcast(`${shippedVolume} DNs handed over: ${yesterday.toLocaleDateString('en-GB', dateOptions)}<br>-${LU10} AOS DNs for delivery today: ${today.toLocaleDateString('en-GB', dateOptions)}<br>-${UTL} AC DNs for delivery today: ${today.toLocaleDateString('en-GB', dateOptions)}`);

        //Date breakdown not required as the values are provided above
    }
    else
    {   //weekend mode of the report

        let shipDates = [], shipDatesLU10 = [], shipDatesUTL = [];

        shippedreport.worksheets[0].getColumn('BU').eachCell((cell, rowNum) =>
        {
            if(rowNum == 1)
                return;

            shippedVolume++;

            //check if saturday
            if(Array.from(shippedreport.worksheets[0].getColumn('J').values)[rowNum] == 'Saturday Delivery')
                saturdayVol++;
            else if (cell.value == 'LU10')
                LU10++;
            else if (cell.value == 7254)
                UTL++;

            
            //date breakdown for Half8 Graph
            let sd = Array.from(shippedreport.worksheets[0].getColumn('L').values)[rowNum];
            if(shipDates.includes(sd))
            {
                if (cell.value == 'LU10')
                {
                    shipDatesLU10[shipDates.indexOf(sd)]++;
                }
                else if (cell.value == 7254)
                {
                    shipDatesUTL[shipDates.indexOf(sd)]++;
                }
            }
            else
            {
                shipDates.push(sd);

                if (cell.value == 'LU10')
                {
                    shipDatesLU10.push(1);
                    shipDatesUTL.push(0);
                }
                else if (cell.value == 7254)
                {
                    shipDatesLU10.push(0);
                    shipDatesUTL.push(1);
                }
            }

        });

        let dateBreakdownString = "Date breakdown:";
        for(let i = 0; i < shipDates.length; i++)
        {
            dateBreakdownString += `<br>${shipDates[i]} - AOS: ${shipDatesLU10[i]} AC: ${shipDatesUTL[i]}`
        }

        //this works!!
        Broadcast(`${shippedVolume} DN's handed over: ${itsFriday.toLocaleDateString('en-GB', dateOptions)} to ${yesterday.toLocaleDateString('en-GB', dateOptions)}<br>-${saturdayVol} DNs handed over for delivery: ${itsSaturday.toLocaleDateString('en-GB', dateOptions)}<br>-${LU10} AOS DNs for delivery today: ${today.toLocaleDateString('en-GB', dateOptions)}<br>-${UTL} AC DNs for delivery today: ${today.toLocaleDateString('en-GB', dateOptions)}<br><br>${dateBreakdownString}`);

        return;
    }
}

async function DHLAPIPost(path, data)
{   //this POSTs data to the DHLAPI endpoint via a given path.
    //this can be easily generalized by specifying a URI to POST to.

    //due to NDA the DHLAPI project was removed from this repo!
    return new Promise((resolve, reject) =>
    {
        try
        {
            let request = http.request({hostname:config.api.hostname, port: config.api.port, path: path, method:"POST", headers: {"Content-Type": "application/json"}}, (res) =>
            {
                let data = "";
                res.on("data", chunk => { data += chunk });
                res.on("end", () => 
                {
                    resolve(data);
                });
            });
            request.write(JSON.stringify(data));
            request.end();
        }
        catch(e)
        {
            reject(e)
        }

    });
}

function time(filename)
{   //helper function to format dates for logging and for filenames.

    let d = new Date();

    if (filename)
        return `${String(d.getUTCFullYear()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCHours()).padStart(2, '0')}-${String(d.getUTCMinutes()).padStart(2, '0')}-${String(d.getUTCSeconds()).padStart(2, '0')}`;

    return `${String(d.getUTCFullYear()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}