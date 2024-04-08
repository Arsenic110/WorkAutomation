/* eslint-disable */

// ==UserScript==
// @name         SpeedView
// @namespace    SynView/SpeedView
// @version      1.1
// @description  Automatically logs pre-set cases, also sets default case Media, Type , and Close Reason for quick use.
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let mediaPS8, typePS8, queryReasonZ89, queryTypeOrderStatus;

    //add sessionstorage
    let autoCase = JSON.parse(sessionStorage.getItem("AutoCase"));
    console.log(sessionStorage.getItem("closeQuery"));

    if(sessionStorage.getItem("clickTab"))
    {
        sessionStorage.removeItem("closeQuery");
        sessionStorage.removeItem("AutoCase");
        sessionStorage.removeItem("clickTab");

        document.getElementById("delivery-tab").click();
    }

    if(sessionStorage.getItem("closeQuery"))
    {
        sessionStorage.removeItem("closeQuery");
        sessionStorage.removeItem("AutoCase");

        sessionStorage.setItem("clickTab", true)

        //Close Query button
        disable_foreground("close_query");
        setCloseQuery("Z59");

        //OK button
        close_syn_case_query_commit();
    }

    if(autoCase)
    {
        //click new query button
        disable_foreground("new_case");
        //do auto set up
        setAddNewCase(autoCase.media, autoCase.type, autoCase.queryType);

        //clear sessionstorage for this function first to ensure safe operation
        sessionStorage.removeItem("AutoCase");
        //set message
        setNewCaseMessage(autoCase.message);
        //now set sessionStorage to close query
        sessionStorage.setItem("closeQuery", true);

        //OK button
        new_syn_case_query_commit();
    }
    else
    {
        //default setup for efficiency
        setAddNewCase("PS8", "PS8", "Q056");
        setCloseQuery("Z89");
    }

    function setAddNewCase(media, type, queryType)
    {
        ncMedia(media);
        ncCustomer(type);
        cqQueryType(queryType);

    }
    function setCloseQuery(query)
    {
        cqQuery(query);
    }

    function ncMedia(media)
    {
        mediaPS8 = document.getElementById("nc_media");

        if(!mediaPS8)
            return;
        if(!media)
            media = "PS8";

        let children = mediaPS8.children;

        for(let i = 0; i < children.length; i++)
        {
            if(children[i].value == media)
            {
                children[i].selected = "selected";
            }
        }
    }

    function ncCustomer(type)
    {
        typePS8 = document.getElementById("nc_customer_type");

        if(!typePS8)
            return;
        if(!type)
            type = "PS8";

        let children = typePS8.children;

        for(let i = 0; i < children.length; i++)
        {
            if(children[i].value == type)
            {
                children[i].selected = "selected";
            }
        }
    }

    function cqQuery(query)
    {
        queryReasonZ89 = document.getElementById("cq_query_reason");

        if(!queryReasonZ89)
            return;
        if(!query)
            query = "Z89";

        let children = queryReasonZ89.children;

        for(let i = 0; i < children.length; i++)
        {
            //Z89 - Customer Not Home
            if(children[i].value == query)
            {
                children[i].selected = "selected";
            }
        }
    }

    function cqQueryType(queryType)
    {
        queryTypeOrderStatus = document.getElementById("nc_query_type");

        if(!queryTypeOrderStatus)
            return;
        if(!queryType)
            queryType = "Q056";

        let children = queryTypeOrderStatus.children;

        for(let i = 0; i < children.length; i++)
        {
            //D - Order Status Requested
            if(children[i].value == queryType)
            {
                children[i].selected = "selected";
            }
        }
    }

    function setNewCaseMessage(message)
    {
        let messageBox = document.getElementById("nc_note");
        messageBox.innerHTML = message;
    }
})();