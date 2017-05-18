/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* global XPathResult */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_table = (function() {
    "use strict";
    var tableStyle = "border: 1px solid black;";
    var datatable = null;

    /**
     * Add a td to the row tr element, and return the td.
     */
    var addCell = function(row, value) {
        var td = row.ownerDocument.createElement("td");
        td.setAttribute("style", tableStyle);
        row.appendChild(td);
        td.textContent = value;
        return td;
    };

    /**
     * Add a td to the row tr element, and return the td.
     */
    var addElemCell = function(row, elem) {
        var td = row.ownerDocument.createElement("td");
        td.setAttribute("style", tableStyle);
        row.appendChild(td);
        td.appendChild(elem);
        return td;
    };

    /**
     * Add a td to the row tr element, and return the td.
     */
    var addLinkCell = function(row, text, href) {
        var a = row.ownerDocument.createElement("a");
        a.textContent = text;
        a.href = href;
        return addElemCell(row, a);
    };

    // TODO unglobalize cols.
    var cols = [
        { field_name:"order id",
          type:"func",
          func:function(order, row){
              addLinkCell(
                  row, order.id,
                  amazon_order_history_util.getOrderDetailUrl(order.id));
          },
          is_numeric:false },
        { field_name:"items",
          type:"func",
          func:function(order, row){
              addElemCell(row, order.itemsHtml(document));
          },
          is_numeric:false },
        { field_name:"to", type:"plain", property_name:"who",
          is_numeric:false },
        { field_name:"date", type:"plain", property_name:"date",
          is_numeric:false },
        { field_name:"total", type:"plain", property_name:"total",
          is_numeric:true },
        { field_name:"postage", type:"detail", property_name:"postage",
          is_numeric:true },
        { field_name:"gift", type:"detail", property_name:"gift",
          is_numeric:true },
        { field_name:"vat", type:"detail", property_name:"vat",
          is_numeric:true,
          help:"Caution: when stuff is not supplied by Amazon, then VAT is often not listed." },
    ];

    function displayOrders(orders, beautiful) {
        Promise.all(orders).then(
            function(orders) {
                reallyDisplayOrders(orders, beautiful);
            }
        );
    }

    function reallyDisplayOrders(orders, beautiful) {
        var addOrderTable = function(id, orders) {
            var addHeader = function(row, value, help) {
                var th = row.ownerDocument.createElement("th");
                th.setAttribute("style", tableStyle);
                row.appendChild(th);
                th.textContent = value;
                if( help ) {
                    th.setAttribute('title', help);
                }
                return th;
            };

            var appendOrderRow = function(table, order) {
                var tr = document.createElement("tr");
                tr.setAttribute("style", tableStyle);
                table.appendChild(tr);
                cols.forEach(function(col_spec){
                    switch(col_spec.type) {
                        case "plain":
                            addCell(tr, order[col_spec.property_name]);
                            break;
                        case "detail":
                            var td = addCell(tr, "pending");
                            order.detail_promise.then(
                                function(detail) {
                                    td.innerHTML = detail[col_spec.property_name];
                                    if(datatable) {
                                        datatable.rows().invalidate();
                                        datatable.draw();
                                    }
                                }
                            );
                            break;
                        case "func":
                            col_spec.func(order, tr);
                            break;
                    }
                });
            };
            var table;
            var thead;
            var hr;
            var tfoot;
            var fr;
            var tbody;
            var isus;

            table = document.createElement("table");
            document.body.appendChild(table);
            table.setAttribute("id", id);
            table.setAttribute("class", "display stripe compact");
            table.setAttribute("style", tableStyle);

            thead = document.createElement("thead");
            table.appendChild(thead);

            hr = document.createElement("tr");
            thead.appendChild(hr);

            tfoot = document.createElement("tfoot");
            table.appendChild(tfoot);

            fr = document.createElement("tr");
            tfoot.appendChild(fr);
            
            isus = amazon_order_history_util.getSite().endsWith("\.com");

            cols.forEach(function(col_spec){
                var fieldName = col_spec.field_name;
                if (isus && fieldName === "vat") {
                    col_spec.field_name = "tax";
                    col_spec.help = "Caution: when stuff is not supplied by Amazon, then tax is often not collected.";
                }
                if (isus && fieldName === "postage") {
                    col_spec.field_name = "shipping";
                }
                addHeader(hr, col_spec.field_name, col_spec.help);
                addHeader(fr, col_spec.field_name, col_spec.help);
            });

            tbody = document.createElement("tbody");
            table.appendChild(tbody);

            orders.forEach(function(order) { appendOrderRow(tbody, order); });
        };
        var clearHeaders = function() {
            while(document.head.firstChild) {
                document.head.removeChild(document.head.firstChild);
            }
        };
        clearHeaders();
        document.body.textContent = "";
        amazon_order_history_inject.addYearButtons();
        addOrderTable("order_table", orders);
        if(beautiful) {
            $(document).ready(function() {
                datatable = $("#order_table").DataTable({
                    "bPaginate": true,
                    "lengthMenu": [ [10, 25, 50, 100, -1],
                                    [10, 25, 50, 100, "All"] ],
                    "footerCallback": function(row, data, start, end, display) {
                        var api = this.api();
                        // Remove the formatting to get integer data for summation
                        var floatVal = function(i) {
                            if(typeof i === "string") {
                                return i === "N/A" ?
                                    0 : parseFloat(i.replace(/^[£$]/, ""));
                            }
                            if(typeof i === "number") { return i; }
                            return 0;
                        };
                        var col_index = 0;
                        cols.forEach(function(col_spec){
                            if(col_spec.is_numeric) {
                                col_spec.sum = api
                                    .column(col_index)
                                    .data()
                                    .reduce(function(a, b) {
                                        return floatVal(a) + floatVal(b);
                                    });
                                col_spec.pageSum = api
                                    .column(col_index, { page: "current" })
                                    .data()
                                    .reduce(function(a, b) {
                                        return floatVal(a) + floatVal(b);
                                    }, 0);

                                $(api.column(col_index).footer()).html(
                                    sprintf("page sum=%s; all=%s",
                                        col_spec.pageSum.toFixed(2),
                                        col_spec.sum.toFixed(2))
                                );
                            }
                            col_index += 1;
                        });
                    }
                });
                amazon_order_history_util.addButton(
                    "plain table",
                    function() {
                        reallyDisplayOrders(orders, false);
                    },
                    "background-color:cornflowerblue; color:white"
                );
            });
        } else {
            amazon_order_history_util.addButton(
                "data table",
                function() {
                    reallyDisplayOrders(orders, true);
                },
                "background-color:cornflowerblue; color:white"
            );
        }
    }

    return {displayOrders: displayOrders};
})();
